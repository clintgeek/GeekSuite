/** `/settings` — one page, a column of cards (the GameGeek/BookGeek shape). */
import React, { useEffect } from 'react';
import { Box, Button, Typography } from '@mui/material';
import {
  CategoryOutlined as TypesIcon,
  DeleteOutline as TrashIcon,
  LockOutlined as LockIcon,
  PlaceOutlined as PlacesIcon,
  ReceiptLongOutlined as InsuranceIcon,
} from '@mui/icons-material';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { useVocabulary } from '../../hooks/useThingMeta';
import { visuallyHidden } from '../../utils/a11y';
import { AccountCard, AppearanceCard } from './AppearanceAccountCards';
import SettingsCard from './SettingsCard';

const PRIVACY_POINTS = [
  ['Masked on screen', 'Serials, VINs, hull and registration numbers show only their last four until someone taps Reveal — and hide again when you leave the page.'],
  ['Never sent to AI', "When ThingGeek grows an Ask feature, the model sees “has a serial: yes” — never the serial, a document's contents, or what anything is worth."],
  ['Printed for the insurer', 'The insurance report and its CSV carry identifiers in full. They are the one place they leave the app whole.'],
  ['Members only', 'Only the people in this household can open ThingGeek. Anyone else who signs in sees a members-only page.'],
];

export default function SettingsView({ user, onSignOut }) {
  const location = useLocation();
  const { trashDays } = useVocabulary();

  useEffect(() => {
    if (!location.hash) return;
    document.getElementById(location.hash.slice(1))?.scrollIntoView?.({ block: 'start' });
  }, [location.hash]);

  return (
    <Box sx={{ px: { xs: 2, md: 3 }, py: { xs: 2, md: 3 }, maxWidth: 820, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 2, pb: 8 }}>
      <Box sx={{ mb: 0.5 }}>
        <Typography component="h1" sx={visuallyHidden}>
          Settings
        </Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>How ThingGeek looks, how it keeps the sensitive parts, and where the household's setup lives.</Typography>
      </Box>

      <SettingsCard id="privacy" title="How identifiers are kept" description="ThingGeek holds serial numbers for firearms, vehicles and tools. These are the rules, and they don't have switches.">
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5 }}>
          {PRIVACY_POINTS.map(([title, text]) => (
            <Box component="li" key={title} sx={{ display: 'flex', gap: 1.25 }}>
              <LockIcon aria-hidden="true" sx={{ fontSize: 18, color: 'primary.main', mt: '2px' }} />
              <Box>
                <Typography sx={{ fontWeight: 700, fontSize: '0.9375rem' }}>{title}</Typography>
                <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', lineHeight: 1.55 }}>{text}</Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </SettingsCard>

      <SettingsCard id="setup" title="The household's setup" description={`Types and the Where tree are shared by everyone here. Trashed things are kept ${trashDays} days.`}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
          <Button component={RouterLink} to="/types" variant="outlined" startIcon={<TypesIcon />} sx={{ justifyContent: 'flex-start', color: 'text.primary' }}>
            Types & their fields
          </Button>
          <Button component={RouterLink} to="/where" variant="outlined" startIcon={<PlacesIcon />} sx={{ justifyContent: 'flex-start', color: 'text.primary' }}>
            Where things are
          </Button>
          <Button component={RouterLink} to="/insurance" variant="outlined" startIcon={<InsuranceIcon />} sx={{ justifyContent: 'flex-start', color: 'text.primary' }}>
            Insurance report
          </Button>
          <Button component={RouterLink} to="/trash" variant="outlined" startIcon={<TrashIcon />} sx={{ justifyContent: 'flex-start', color: 'text.primary' }}>
            Trash
          </Button>
        </Box>
      </SettingsCard>

      <AppearanceCard />
      <AccountCard user={user} onSignOut={onSignOut} />
    </Box>
  );
}
