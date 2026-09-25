/** One small glyph per platform family — desktop, handheld, console, mobile, cloud. */
import React from 'react';
import {
  CloudOutlined as CloudIcon,
  DesktopWindowsOutlined as DesktopIcon,
  SmartphoneOutlined as MobileIcon,
  SportsEsportsOutlined as ConsoleIcon,
  VideogameAssetOutlined as HandheldIcon,
} from '@mui/icons-material';
import { platformFamily } from '../utils/vocab';

const ICONS = {
  desktop: DesktopIcon,
  handheld: HandheldIcon,
  console: ConsoleIcon,
  mobile: MobileIcon,
  cloud: CloudIcon,
};

export default function PlatformGlyph({ platform, sx, ...props }) {
  const Icon = ICONS[platformFamily(platform)] || ConsoleIcon;
  return <Icon aria-hidden="true" sx={{ fontSize: 14, ...sx }} {...props} />;
}
