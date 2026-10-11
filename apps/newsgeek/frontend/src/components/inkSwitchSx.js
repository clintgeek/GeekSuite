/**
 * MUI's default unchecked thumb is near-white: invisible on newsprint. Ink
 * thumbs in both states (inkSoft off, ink on) against the page; position, not
 * colour, says which. Measured in gazetteContrast. Shared by every NewsGeek
 * switch (Free to read, a source's on/off, On for everyone).
 */
export const INK_SWITCH_SX = {
  '& .MuiSwitch-thumb': { bgcolor: 'text.secondary', boxShadow: 'none' },
  '& .MuiSwitch-track': { bgcolor: 'text.secondary', opacity: 0.25 },
  '& .Mui-checked .MuiSwitch-thumb': { bgcolor: 'text.primary' },
  '& .Mui-checked + .MuiSwitch-track': { bgcolor: 'text.primary', opacity: 0.5 },
  '& .Mui-focusVisible .MuiSwitch-thumb': { outline: '2px solid', outlineColor: 'text.primary', outlineOffset: 2 },
};
