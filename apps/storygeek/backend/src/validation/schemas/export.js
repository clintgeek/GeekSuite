// export.js's two routes (bookify, epub) take no body — everything they need
// comes from `req.params.storyId` (already loaded and ownership-checked by
// requireStoryOwner) and the Authorization header. Nothing to validate here
// beyond the shared storyId params shape; re-exported rather than duplicated
// so every story-scoped route family checks storyId the same way.
import { storyIdParamsSchema } from './common.js';

export { storyIdParamsSchema };
export default { storyIdParamsSchema };
