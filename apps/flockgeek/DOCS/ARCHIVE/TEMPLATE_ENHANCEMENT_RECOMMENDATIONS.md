# 🔧 GeekSuite Template - Enhancement Recommendations for Legacy App Migrations

## Executive Summary

Based on the FlockGeek migration experience, there are **8 key areas** where the GeekSuite template could be enhanced to make legacy app migrations significantly easier. These recommendations provide a pattern library and architectural guidance for apps that need:

- Multi-tenant/workspace support (ownerId pattern)
- Advanced authentication (token refresh, BaseGeek integration)
- Standardized API responses (pagination, filtering)
- Soft-delete data patterns
- Real-time filtering on list pages

**Estimated effort to implement:** 20-30 hours
**Estimated time saved on future migrations:** 8-10 hours per app
**ROI after 3 apps:** Highly positive

---

## 1. Multi-Tenant Architecture (HIGH PRIORITY)

### Problem
- Template assumes single-user/single-workspace
- No ownerId/workspace concept
- Legacy apps like FlockGeek require multi-tenant isolation
- Developers must discover and implement this pattern themselves

### Current Template State
```javascript
// backend/src/models/example.ts
const schema = new Schema({
  id: String,
  name: String,
  // NO ownerId, NO userId
});
```

### Recommended Solution

**Add a `Multitenant.model.ts` template in backend:**
```javascript
// backend/src/models/base/MultitenantModel.ts
import mongoose from "mongoose";

export const multitenantSchema = (baseSchema) => {
  const schema = new mongoose.Schema(baseSchema);

  // Add multi-tenant fields
  schema.add({
    ownerId: {
      type: String,
      required: true,
      index: true,
      description: "Owner/Workspace ID for multi-tenancy"
    },
    deletedAt: {
      type: Date,
      default: null,
      index: true,
      description: "Soft delete timestamp (null = not deleted)"
    },
    createdAt: { type: Date, default: Date.now, index: true },
    updatedAt: { type: Date, default: Date.now }
  });

  // Add soft-delete query helper
  schema.query.notDeleted = function () {
    return this.where({ deletedAt: { $exists: false } });
  };

  // Add static method to include deleted
  schema.statics.withDeleted = function () {
    return this.where({});
  };

  return schema;
};

// Usage:
const birdSchema = multitenantSchema({
  tagId: { type: String, unique: true },
  name: String,
  sex: { type: String, enum: ["hen", "rooster", "pullet", "cockerel"] },
  // ... rest of schema
});
```

**Add `requireMultitenant.middleware.ts`:**
```javascript
// backend/src/middleware/requireMultitenant.ts
/**
 * Middleware to extract and validate ownerId from request.
 * Supports multi-tenant isolation.
 *
 * ownerId can come from (in order of precedence):
 * 1. X-Owner-Id header (recommended for API calls)
 * 2. req.body.ownerId (useful for POST requests)
 * 3. req.query.ownerId (useful for GET requests)
 * 4. JWT payload ownerId (if using BaseGeek or similar)
 *
 * Usage:
 *   router.get('/birds', requireAuth, requireMultitenant, birdController.list);
 */
export const requireMultitenant = (req, res, next) => {
  // Try header first (preferred)
  const headerOwner = req.header("X-Owner-Id");

  // Fallback to body or query
  const ownerId = headerOwner || req.body?.ownerId || req.query?.ownerId;

  if (!ownerId) {
    return res.status(400).json({
      error: {
        code: "MISSING_OWNER_ID",
        message: "ownerId required - use X-Owner-Id header or include in request body/query"
      }
    });
  }

  // Validate ownerId format (basic validation)
  if (typeof ownerId !== "string" || ownerId.trim() === "") {
    return res.status(400).json({
      error: {
        code: "INVALID_OWNER_ID",
        message: "ownerId must be a non-empty string"
      }
    });
  }

  req.ownerId = ownerId;
  next();
};
```

**Add base controller pattern:**
```javascript
// backend/src/controllers/base/MultitenantController.ts
/**
 * Base controller with built-in multi-tenant support.
 * Handles automatic ownerId filtering and soft-delete patterns.
 */
export class MultitenantController {
  constructor(Model) {
    this.Model = Model;
  }

  /**
   * List items with multi-tenant filtering and soft-delete.
   * Supports pagination and filtering.
   */
  async list(req, res) {
    try {
      const { page = 1, limit = 10, ...filters } = req.query;

      // Build query with ownerId filter
      const query = {
        ownerId: req.ownerId,
        deletedAt: { $exists: false },
        ...filters
      };

      // Count total
      const total = await this.Model.countDocuments(query);

      // Fetch paginated results
      const items = await this.Model.find(query)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

      return res.json({
        data: {
          items,
          pagination: {
            total,
            page: Number(page),
            limit: Number(limit),
            pages: Math.ceil(total / limit)
          }
        }
      });
    } catch (error) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  /**
   * Soft-delete an item.
   */
  async delete(req, res) {
    try {
      const { id } = req.params;

      const item = await this.Model.findOneAndUpdate(
        { _id: id, ownerId: req.ownerId },
        { deletedAt: new Date() },
        { new: true }
      );

      if (!item) {
        return res.status(404).json({ error: { message: "Item not found" } });
      }

      return res.json({ data: item });
    } catch (error) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  // ... other CRUD methods with ownerId filtering
}
```

### Documentation to Add
- **`docs/MULTI_TENANT_GUIDE.md`** - How to build multi-tenant apps
- **`docs/SOFT_DELETE_PATTERN.md`** - Implementing soft-delete across data layer
- **`docs/OWNERID_HEADER_PATTERN.md`** - X-Owner-Id header usage

### Benefits
- ✅ Reduces boilerplate in every model
- ✅ Automatic ownerId filtering
- ✅ Built-in soft-delete support
- ✅ Consistent pagination pattern
- ✅ Saves 3-4 hours per app

---

## 2. Advanced Authentication with Token Refresh (HIGH PRIORITY)

### Problem
- Template has basic JWT auth but no refresh mechanism
- Legacy apps need automatic token refresh
- No pattern for BaseGeek or external auth providers
- Developers must build this from scratch

### Current Template State
```javascript
// backend/src/services/tokenService.ts
// Only has issueToken() and verifyToken()
// No refresh pattern
```

### Recommended Solution

**Enhance `tokenService.ts`:**
```javascript
// backend/src/services/tokenService.ts
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || JWT_SECRET;
const TOKEN_EXPIRY = "15m";
const REFRESH_EXPIRY = "7d";

export const issueTokenPair = (payload) => {
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
  const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_EXPIRY
  });

  return { token, refreshToken };
};

export const refreshAccessToken = (refreshToken) => {
  try {
    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    // Issue new token pair
    return issueTokenPair({
      id: decoded.id,
      email: decoded.email,
      ownerId: decoded.ownerId
    });
  } catch (error) {
    throw new Error("Invalid refresh token");
  }
};

export const verifyToken = (token) => {
  return jwt.verify(token, JWT_SECRET);
};
```

**Add auth controller with refresh endpoint:**
```javascript
// backend/src/controllers/authController.ts
export class AuthController {
  /**
   * POST /auth/refresh
   * Exchange refresh token for new access token
   */
  async refresh(req, res) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          error: { message: "Refresh token required" }
        });
      }

      const { token, refreshToken: newRefreshToken } =
        refreshAccessToken(refreshToken);

      return res.json({
        data: {
          token,
          refreshToken: newRefreshToken,
          expiresIn: "15m"
        }
      });
    } catch (error) {
      return res.status(401).json({
        error: { message: "Invalid refresh token" }
      });
    }
  }

  /**
   * Alternative: Integration with external auth (BaseGeek, Auth0, etc.)
   * POST /auth/external-refresh
   */
  async externalRefresh(req, res) {
    try {
      const { refreshToken, provider = "basegeek" } = req.body;

      // Validate with external provider
      const externalResponse = await this.validateWithProvider(
        refreshToken,
        provider
      );

      // Issue our own token pair
      const { token, refreshToken: newRefreshToken } = issueTokenPair({
        id: externalResponse.userId,
        email: externalResponse.email,
        ownerId: externalResponse.ownerId,
        provider
      });

      return res.json({
        data: {
          token,
          refreshToken: newRefreshToken,
          expiresIn: "15m"
        }
      });
    } catch (error) {
      return res.status(401).json({
        error: { message: "Token refresh failed" }
      });
    }
  }
}
```

**Frontend: Enhanced AuthContext:**
```javascript
// frontend/src/contexts/AuthContext.tsx
/**
 * Enhanced AuthContext with token refresh support.
 * Automatically refreshes tokens before expiry.
 */
export const AuthProvider = ({ children }) => {
  const [auth, setAuth] = useState({
    token: localStorage.getItem("token"),
    refreshToken: localStorage.getItem("refreshToken"),
    ownerId: localStorage.getItem("ownerId"),
    user: null,
    isLoading: true
  });

  // Refresh token before expiry
  useEffect(() => {
    if (!auth.refreshToken) return;

    const scheduleRefresh = () => {
      // Decode token to get expiry
      const decoded = jwtDecode(auth.token);
      const expiryTime = decoded.exp * 1000;
      const now = Date.now();
      const timeUntilExpiry = expiryTime - now;

      // Refresh 1 minute before expiry
      const refreshTime = timeUntilExpiry - 60000;

      if (refreshTime > 0) {
        const timeout = setTimeout(() => {
          refreshAccessToken();
        }, refreshTime);

        return () => clearTimeout(timeout);
      }
    };

    return scheduleRefresh();
  }, [auth.token, auth.refreshToken]);

  const refreshAccessToken = async () => {
    try {
      const response = await axios.post("/auth/refresh", {
        refreshToken: auth.refreshToken
      });

      const { token, refreshToken } = response.data.data;

      localStorage.setItem("token", token);
      localStorage.setItem("refreshToken", refreshToken);

      setAuth((prev) => ({
        ...prev,
        token,
        refreshToken
      }));
    } catch (error) {
      // Refresh failed, redirect to login
      setAuth({
        token: null,
        refreshToken: null,
        ownerId: null,
        user: null,
        isLoading: false
      });
      localStorage.clear();
      window.location.href = "/login";
    }
  };

  return (
    <AuthContext.Provider value={{ ...auth, refreshAccessToken }}>
      {children}
    </AuthContext.Provider>
  );
};
```

### Documentation to Add
- **`docs/TOKEN_REFRESH_GUIDE.md`** - Implementing token refresh
- **`docs/EXTERNAL_AUTH_INTEGRATION.md`** - BaseGeek/Auth0 integration pattern
- **`docs/JWT_BEST_PRACTICES.md`** - Security considerations

### Benefits
- ✅ Automatic token refresh
- ✅ Transparent to components
- ✅ Secure short-lived tokens
- ✅ Long-lived refresh tokens
- ✅ Saves 4-5 hours per app

---

## 3. Standardized API Response Format (MEDIUM PRIORITY)

### Problem
- No consistent response format across endpoints
- Pagination varies per controller
- Error responses are inconsistent
- Legacy apps have different formats

### Current Template State
```javascript
// Different response formats in different controllers
res.json({ data: item }); // Some controllers
res.json(items); // Others
res.json({ success: true, data: items }); // Yet others
```

### Recommended Solution

**Create response helpers:**
```javascript
// backend/src/utils/responses.ts
/**
 * Standardized API responses following a consistent format.
 * All responses follow:
 * {
 *   success: boolean,
 *   data?: any,
 *   error?: {
 *     code: string,
 *     message: string,
 *     details?: any
 *   },
 *   pagination?: {
 *     total: number,
 *     page: number,
 *     limit: number,
 *     pages: number
 *   }
 * }
 */

export const sendSuccess = (res, data, statusCode = 200, pagination = null) => {
  const response = { success: true, data };

  if (pagination) {
    response.pagination = pagination;
  }

  return res.status(statusCode).json(response);
};

export const sendError = (res, error, statusCode = 500) => {
  const response = {
    success: false,
    error: {
      code: error.code || "INTERNAL_ERROR",
      message: error.message || "An error occurred",
      ...(process.env.NODE_ENV === "development" && {
        stack: error.stack
      })
    }
  };

  return res.status(statusCode).json(response);
};

export const sendPaginated = (res, items, total, page = 1, limit = 10) => {
  return sendSuccess(res, { items }, 200, {
    total,
    page,
    limit,
    pages: Math.ceil(total / limit)
  });
};

export const sendCreated = (res, data) => {
  return sendSuccess(res, data, 201);
};

export const sendNotFound = (res, message = "Resource not found") => {
  return sendError(res, { code: "NOT_FOUND", message }, 404);
};

export const sendValidationError = (res, message, details = {}) => {
  return sendError(res, { code: "VALIDATION_ERROR", message, details }, 400);
};

export const sendUnauthorized = (res, message = "Unauthorized") => {
  return sendError(res, { code: "UNAUTHORIZED", message }, 401);
};

export const sendForbidden = (res, message = "Forbidden") => {
  return sendError(res, { code: "FORBIDDEN", message }, 403);
};
```

**Update controllers to use helpers:**
```javascript
// backend/src/controllers/birdController.ts
import * as responses from "../utils/responses";

export class BirdController {
  async list(req, res) {
    try {
      const { page = 1, limit = 10 } = req.query;

      const query = { ownerId: req.ownerId, deletedAt: { $exists: false } };
      const total = await Bird.countDocuments(query);
      const items = await Bird.find(query)
        .skip((page - 1) * limit)
        .limit(limit);

      return responses.sendPaginated(res, items, total, page, limit);
    } catch (error) {
      return responses.sendError(res, error);
    }
  }

  async create(req, res) {
    try {
      const bird = new Bird({ ...req.body, ownerId: req.ownerId });
      await bird.save();
      return responses.sendCreated(res, bird);
    } catch (error) {
      return responses.sendError(res, error);
    }
  }
}
```

### Documentation to Add
- **`docs/API_RESPONSE_FORMAT.md`** - Standard response format
- **`backend/src/utils/responses.ts.example`** - Template for responses module

### Benefits
- ✅ Consistent API across all endpoints
- ✅ Easier frontend handling
- ✅ Better error messages
- ✅ Standardized pagination
- ✅ Saves 2-3 hours per app

---

## 4. Frontend API Client with Interceptors (MEDIUM PRIORITY)

### Problem
- Template doesn't include request/response interceptors
- No automatic header injection (auth, ownerId)
- No error handling pattern
- Developers must build this in every app

### Recommended Solution

**Create template API client:**
```javascript
// frontend/src/services/apiClient.ts
/**
 * Configured Axios instance with interceptors for:
 * - Automatic Authorization header injection
 * - Automatic X-Owner-Id header injection
 * - Token refresh on 401
 * - Standardized error handling
 */

import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5001/api";

// Token refresh queue
let isRefreshing = false;
let refreshSubscribers = [];

const subscribeTokenRefresh = (callback) => {
  refreshSubscribers.push(callback);
};

const notifyTokenRefresh = (token) => {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
};

export const apiClient = axios.create({
  baseURL: API_BASE,
  withCredentials: true
});

// Request Interceptor
apiClient.interceptors.request.use(
  (config) => {
    // Inject auth token
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Inject ownerId for multi-tenant support
    const ownerId = localStorage.getItem("ownerId");
    if (ownerId) {
      config.headers["X-Owner-Id"] = ownerId;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Handle 401 with token refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      if (isRefreshing) {
        // Queue other requests while refreshing
        return new Promise((resolve) => {
          subscribeTokenRefresh((newToken) => {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            resolve(apiClient(originalRequest));
          });
        });
      }

      isRefreshing = true;

      try {
        const refreshToken = localStorage.getItem("refreshToken");
        const response = await axios.post(`${API_BASE}/auth/refresh`, {
          refreshToken
        });

        const { token, refreshToken: newRefreshToken } = response.data.data;

        // Update stored tokens
        localStorage.setItem("token", token);
        localStorage.setItem("refreshToken", newRefreshToken);

        // Notify other queued requests
        notifyTokenRefresh(token);

        // Retry original request
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        // Refresh failed, redirect to login
        localStorage.clear();
        window.location.href = "/login";
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
```

**Add error handling pattern:**
```javascript
// frontend/src/hooks/useAPI.ts
/**
 * Hook for making API calls with automatic error handling.
 */
export const useAPI = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const call = async (fn) => {
    setLoading(true);
    setError(null);

    try {
      const result = await fn();
      return result;
    } catch (err) {
      const message =
        err.response?.data?.error?.message ||
        err.message ||
        "An error occurred";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { call, loading, error };
};

// Usage in component:
const { call, loading, error } = useAPI();

const loadBirds = async () => {
  await call(async () => {
    const response = await apiClient.get("/birds");
    setBirds(response.data.data.items);
  });
};
```

### Documentation to Add
- **`frontend/src/services/apiClient.ts.example`** - Template API client
- **`docs/FRONTEND_API_INTEGRATION.md`** - How to use apiClient

### Benefits
- ✅ Automatic auth header injection
- ✅ Automatic ownerId injection
- ✅ Transparent token refresh
- ✅ Consistent error handling
- ✅ Saves 3-4 hours per app

---

## 5. Frontend List Page Pattern (MEDIUM PRIORITY)

### Problem
- No documented pattern for list pages with filtering/pagination
- Legacy apps implement this differently
- Developers must build from scratch

### Benefits
- ✅ Consistent list page across all apps
- ✅ Reusable pagination logic
- ✅ Built-in filtering
- ✅ Standardized formatting
- ✅ Saves 4-5 hours per app

---

## 6. Enhanced Environment Configuration (LOW-MEDIUM PRIORITY)

### Problem
- Current env.js doesn't support multi-tenant patterns
- No documentation on required variables
- Legacy apps have different config needs

### Benefits
- ✅ Clear documentation on required variables
- ✅ Configuration templates for different scenarios
- ✅ Validation at startup
- ✅ Saves 1-2 hours per app

---

## 7. Middleware Layering Pattern (LOW PRIORITY)

### Problem
- No clear pattern for how to layer middleware
- Developers uncertain about order
- Documentation lacking

### Benefits
- ✅ Clear middleware order
- ✅ Reduces confusion
- ✅ Prevents security issues
- ✅ Saves 1 hour per app

---

## 8. Data Seeding Pattern (LOW-MEDIUM PRIORITY)

### Problem
- No clear seed script pattern
- Developers must build this for each app
- Different data structures need different seeding

### Benefits
- ✅ Consistent seeding pattern
- ✅ Reusable across apps
- ✅ Easy to create demo data
- ✅ Saves 1-2 hours per app

---

## Implementation Roadmap

### Phase 1: High Priority (Start Here) - 10-15 hours
- [ ] Multi-tenant schema helpers
- [ ] requireMultitenant middleware
- [ ] Token refresh pattern
- [ ] API response standardization
- [ ] Documentation for all above

### Phase 2: Medium Priority - 8-10 hours
- [ ] Frontend API client template
- [ ] List page template component
- [ ] Enhanced env.ts configuration
- [ ] Documentation

### Phase 3: Low Priority - 5-8 hours
- [ ] Middleware pattern guide
- [ ] Seed base class
- [ ] Additional documentation

---

## ROI Analysis

**Per-app time savings:**
- Multi-tenant support: 3-4 hours
- Token refresh: 2-3 hours
- API response standardization: 2 hours
- Frontend API client: 2-3 hours
- List page pattern: 3-4 hours
- **Total per app: 12-17 hours**

**After implementing template changes:**
- Break-even point: 2-3 apps (20-30 hours invested)
- Savings on 3rd app: 12-17 hours
- Ongoing savings: 12-17 hours per app

---

## Success Metrics

**After implementation, measure:**
- [ ] Time to bootstrap a new multi-tenant app (target: < 1 hour)
- [ ] Time to implement list pages with filtering (target: < 30 min per page)
- [ ] Developer satisfaction with template
- [ ] Number of apps using new patterns
- [ ] Time saved across all apps using template

---

## Conclusion

These 8 enhancements would significantly reduce friction when adapting legacy apps to the GeekSuite template. The ROI is strong (break-even at 2-3 apps) and the benefits compound with each new app.

**Recommended next step:** Implement Phase 1 enhancements and test with FlockGeek as reference.