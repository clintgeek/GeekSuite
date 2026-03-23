export const sendSuccess = (res, data = null, statusCode = 200, pagination = null) => {
  const response = { success: true };
  if (data !== null) response.data = data;
  if (pagination) response.pagination = pagination;
  return res.status(statusCode).json(response);
};

export const sendError = (res, error = { message: "An error occurred" }, statusCode = 500) => {
  const response = {
    success: false,
    error: {
      code: error.code || "INTERNAL_ERROR",
      message: error.message || "An error occurred",
      details: error.details || undefined
    }
  };

  return res.status(statusCode).json(response);
};

export const sendCreated = (res, data) => sendSuccess(res, data, 201);

export const sendPaginated = (res, items = [], total = 0, page = 1, limit = 10) => {
  const pagination = {
    total,
    page: Number(page),
    limit: Number(limit),
    pages: Math.ceil(total / limit || 0)
  };

  return sendSuccess(res, { items }, 200, pagination);
};
