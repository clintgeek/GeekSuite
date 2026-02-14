# Task Completion Checklist

When completing a task in FitnessGeek, Sage should follow these steps:

## 1. Code Implementation
- [ ] Implement the requested feature/fix
- [ ] Follow code style conventions from `code_style_conventions.md`
- [ ] Adhere to GeekSuite Design System guidelines
- [ ] Use appropriate MUI components and theme
- [ ] Ensure responsive design (mobile, tablet, desktop)

## 2. Code Quality
- [ ] Remove any console.log statements (unless debugging feature)
- [ ] Remove commented-out code
- [ ] Check for proper error handling
- [ ] Verify all imports are used
- [ ] Check for proper prop types or TypeScript types

## 3. Testing Considerations
- [ ] Manually test the feature if possible
- [ ] Consider edge cases
- [ ] Check browser console for errors
- [ ] Verify API endpoints work as expected
- [ ] Test with different data scenarios

## 4. Documentation
- [ ] Update relevant comments if complex logic added
- [ ] Add JSDoc for new functions if appropriate
- [ ] Update README if user-facing feature added
- [ ] Add API documentation comments for new endpoints

## 5. Build & Deployment Workflow
- [ ] **DO NOT** run builds (Chef's responsibility)
- [ ] **DO NOT** restart servers (Chef's responsibility)
- [ ] **DO NOT** use git commands (Chef's responsibility)
- [ ] If changes require rebuild, INFORM Chef with clear instructions:
  - Which service needs rebuild (frontend/backend)
  - What was changed
  - Any environment variables needed
  - Expected behavior after rebuild

## 6. Communication with Chef
- [ ] Summarize what was implemented
- [ ] Note any files created or modified
- [ ] List any dependencies added
- [ ] Explain any architectural decisions
- [ ] Request build/restart if needed
- [ ] Ask for testing/verification

## 7. Node.js Version Reminder
- [ ] If encountering syntax errors, remind Chef to use Node.js LTS (v18+)
- [ ] Suggest `nvm use --lts` if Node version issues appear

## Special Considerations

### For Docker Deployments
1. Changes made locally
2. Files copied to server (if needed)
3. REQUEST Chef to rebuild containers
4. Never attempt to manage Docker containers

### For Database Changes
1. Check MongoDB connection
2. Test queries locally if possible
3. Consider impact on existing data
4. Document any schema changes

### For Frontend Changes
1. Test responsive design
2. Check dark mode compatibility (if applicable)
3. Verify navigation and routing
4. Ensure accessibility

### For Backend Changes
1. Check authentication/authorization
2. Verify error handling
3. Test with different user scenarios
4. Check logging is appropriate

### For AI Integration Features
1. Verify baseGeek AI service connection
2. Check API key configuration
3. Test with various input scenarios
4. Handle API failures gracefully
5. Provide user feedback during long operations

## Final Verification
- [ ] Code follows established patterns in the codebase
- [ ] No breaking changes to existing functionality
- [ ] Changes are minimal and focused on the task
- [ ] Ready for Chef to test, build, and deploy