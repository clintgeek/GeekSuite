// Deep-import (see RichTextEditor.jsx for why) instead of the
// '@mui/icons-material' barrel.
import GroupsOutlined from '@mui/icons-material/GroupsOutlined';
import ForumOutlined from '@mui/icons-material/ForumOutlined';
import EventRepeatOutlined from '@mui/icons-material/EventRepeatOutlined';
import FlagOutlined from '@mui/icons-material/FlagOutlined';
import AltRouteOutlined from '@mui/icons-material/AltRouteOutlined';
import BuildOutlined from '@mui/icons-material/BuildOutlined';
import LuggageOutlined from '@mui/icons-material/LuggageOutlined';
import RestaurantOutlined from '@mui/icons-material/RestaurantOutlined';
import SubjectIcon from '@mui/icons-material/Subject';

/**
 * A glyph per template, in the graphite of every other New entry. Kept here
 * (not in utils/noteTemplates.js, so the definitions stay pure data; and not
 * beside the components, so fast refresh keeps working).
 */
export const TEMPLATE_ICONS = {
  meeting: GroupsOutlined,
  'one-to-one': ForumOutlined,
  'weekly-review': EventRepeatOutlined,
  'project-brief': FlagOutlined,
  'decision-record': AltRouteOutlined,
  troubleshooting: BuildOutlined,
  'packing-list': LuggageOutlined,
  recipe: RestaurantOutlined,
};

export const TEMPLATE_FALLBACK_ICON = SubjectIcon;
