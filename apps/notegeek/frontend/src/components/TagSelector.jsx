import React, { useEffect } from 'react';
import { Autocomplete, TextField, Chip, useTheme } from '@mui/material';
import LocalOfferOutlined from '@mui/icons-material/LocalOfferOutlined';
import useTagStore from '../store/tagStore';
import { normalizeTags, filterTagOptions } from '../utils/tagPath';

/**
 * The note's tag chips. Tags are paths (`house/garage`) in the suite
 * standard (`@geeksuite/tags`): whatever is typed is normalized the way the
 * gateway stores it when it is COMMITTED (Enter / pick) — `House / Garage`
 * → `house/garage`, `#GeekSuite` → `geek-suite` — so the chip shows exactly
 * what is saved. The text field is left alone while typing: normalizing it
 * live would eat the space in `geek s…` before the next word arrived. The
 * options are full paths, matched against the normalized query.
 */
function TagSelector({ selectedTags, onChange, disabled = false }) {
  const { tags, fetchTags } = useTagStore();
  const theme = useTheme();

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  return (
    <Autocomplete
      multiple
      id="tags-selector"
      options={tags.map(tag => tag.name || tag)}
      value={selectedTags}
      onChange={(event, newValue) => onChange(normalizeTags(newValue))}
      filterOptions={(options, state) => filterTagOptions(options, state.inputValue)}
      disabled={disabled}
      freeSolo
      filterSelectedOptions
      selectOnFocus
      clearOnBlur
      handleHomeEndKeys
      isOptionEqualToValue={(option, value) => option === value}
      renderTags={(value, getTagProps) =>
        value.map((option, index) => {
          const { key, onDelete, ...tagProps } = getTagProps({ index });
          return (
            <Chip
              key={key ?? index}
              label={option}
              size="small"
              {...tagProps}
              onDelete={disabled ? undefined : onDelete}
              disabled={disabled}
            />
          );
        })
      }
      renderInput={(params) => (
        // A quiet inline field under the title, not a boxed form control:
        // a tag glyph, the chips, and a place to type. Its name comes from
        // `aria-label`, since there is no visible label any more.
        <TextField
          {...params}
          variant="standard"
          placeholder={disabled ? "" : (selectedTags?.length ? "add tag…" : "add tags")}
          size="small"
          disabled={disabled}
          inputProps={{ ...params.inputProps, 'aria-label': 'Tags' }}
          InputProps={{
            ...params.InputProps,
            disableUnderline: true,
            startAdornment: (
              <>
                <LocalOfferOutlined aria-hidden sx={{ fontSize: 14, color: 'text.secondary', mr: '6px', ml: '1px' }} />
                {params.InputProps.startAdornment}
              </>
            ),
          }}
        />
      )}
      size="small"
      sx={{
        width: '100%',
        '& .MuiInputBase-root': {
          gap: '4px',
          fontFamily: theme.typography.fontFamily,
          fontSize: '0.875rem',
          alignItems: 'center',
          // 44px hit area on phones (MOBILE_UI_PLAN §2); compact above.
          minHeight: 44,
          [theme.breakpoints.up('sm')]: { minHeight: 32 },
        },
        '& .MuiInputBase-input::placeholder': { color: theme.palette.text.secondary, opacity: 1 },
        '& .MuiChip-root': { height: 26, bgcolor: 'transparent', fontSize: '0.8125rem' },
        // Read-only (a mind map in view mode): the tags are still content to
        // read, so no 38%-opacity "disabled" wash — that put 12px labels at
        // 3.0:1. Full-strength secondary ink instead, and no delete glyph.
        '& .MuiChip-root.Mui-disabled': { opacity: 1, color: theme.palette.text.secondary },
        '& .MuiAutocomplete-inputRoot.Mui-disabled': { color: theme.palette.text.secondary },
      }}
    />
  );
}

export default TagSelector;