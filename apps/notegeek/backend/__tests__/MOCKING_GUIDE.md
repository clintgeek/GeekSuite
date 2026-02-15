# Jest Mocking Guide

## Mocking Checklist

### Before Writing Tests
- [ ] Identify all external dependencies that need mocking
- [ ] Check if mocks need to be set up before imports
- [ ] Verify mock setup matches actual module structure
- [ ] Plan mock return values and behaviors

### During Test Setup
- [ ] Use `jest.mock()` for module-level mocks
- [ ] Set up `jest.fn()` for function mocks
- [ ] Configure mock return values with `mockReturnValue` or `mockResolvedValue`
- [ ] Set up error cases with `mockRejectedValue` or `mockImplementation`
- [ ] Mock environment variables if needed

### During Test Execution
- [ ] Verify mock functions are called with correct arguments
- [ ] Check mock function call counts
- [ ] Validate mock return values
- [ ] Test error cases and edge conditions

### After Tests
- [ ] Clean up mocks with `jest.clearAllMocks()`
- [ ] Reset mock implementations with `mockReset()`
- [ ] Restore original implementations if needed
- [ ] Clean up any test data or state

## Common Mock Templates

### 1. Basic Function Mock
```javascript
const mockFn = jest.fn();
mockFn.mockReturnValue('return value');
// or
mockFn.mockResolvedValue('async return value');
```

### 2. Module Mock
```javascript
jest.mock('module-name', () => ({
    functionName: jest.fn().mockReturnValue('value'),
    asyncFunction: jest.fn().mockResolvedValue('async value')
}));
```

### 3. Error Case Mock
```javascript
jest.mock('module-name', () => ({
    functionName: jest.fn().mockImplementation(() => {
        throw new Error('Error message');
    })
}));
```

### 4. Request/Response Mock
```javascript
const mockReq = (body = {}, params = {}, query = {}) => ({
    body,
    params,
    query,
    headers: {}
});

const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};
```

### 5. Database Mock
```javascript
jest.mock('mongoose', () => ({
    connect: jest.fn().mockResolvedValue(true),
    connection: {
        dropDatabase: jest.fn().mockResolvedValue(true),
        close: jest.fn().mockResolvedValue(true)
    },
    Schema: jest.fn(),
    model: jest.fn(),
    Types: {
        ObjectId: jest.fn()
    }
}));
```

## Common Mistakes to Avoid

1. **Timing Issues**
   - Forgetting to mock before imports
   - Not awaiting async mock functions
   - Incorrect mock setup order

2. **Mock Structure**
   - Not matching the actual module structure
   - Missing required functions or properties
   - Incorrect mock function setup

3. **Cleanup**
   - Forgetting to clear mocks between tests
   - Not resetting mock implementations
   - Leaving test data in the database

4. **Assertions**
   - Not verifying mock function calls
   - Incorrect argument matching
   - Missing error case testing

5. **Async/Await**
   - Forgetting to await async functions
   - Not handling promise rejections
   - Incorrect mock resolution timing

## Debugging Tips

1. **Mock Verification**
   ```javascript
   console.log(mockFn.mock.calls); // See all calls
   console.log(mockFn.mock.results); // See all results
   ```

2. **Mock State**
   ```javascript
   expect(mockFn).toHaveBeenCalled();
   expect(mockFn).toHaveBeenCalledWith(expectedArgs);
   expect(mockFn).toHaveBeenCalledTimes(expectedCount);
   ```

3. **Error Cases**
   ```javascript
   mockFn.mockImplementation(() => {
       throw new Error('Test error');
   });
   ```

4. **Async Flow**
   ```javascript
   await expect(asyncFunction()).rejects.toThrow();
   expect(mockFn).toHaveBeenCalled();
   ```

## Best Practices

1. **Organization**
   - Group related mocks together
   - Use descriptive mock names
   - Keep mock setup close to tests

2. **Maintenance**
   - Update mocks when dependencies change
   - Document complex mock behaviors
   - Keep mock templates up to date

3. **Testing**
   - Test both success and error cases
   - Verify mock interactions
   - Clean up after tests

4. **Performance**
   - Use appropriate mock granularity
   - Avoid unnecessary mocks
   - Clean up unused mocks