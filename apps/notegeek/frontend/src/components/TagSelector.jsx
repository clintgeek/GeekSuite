import React, { useEffect } from 'react';
import { Autocomplete, TextField, Chip } from '@mui/material';
import useTagStore from '../store/tagStore';

function TagSelector({ selectedTags, onChange, disabled }) {
  const { tags, fetchTags } = useTagStore();

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  return (
    <Autocomplete
      multiple
      id="tags-selector"
      options={tags.map(tag => tag.name || tag)}
      value={selectedTags}
      onChange={(event, newValue) => onChange(newValue)}
      disabled={disabled}
      freeSolo
      filterSelectedOptions
      selectOnFocus
      clearOnBlur
      handleHomeEndKeys
      isOptionEqualToValue={(option, value) => option === value}
      renderTags={(value, getTagProps) =>
        value.map((option, index) => (
          <Chip
            label={option}
            size="small"
            {...getTagProps({ index })}
            disabled={disabled}
          />
        ))
      }
      renderInput={(params) => (
        <TextField
          {...params}
          variant="outlined"
          label="Tags"
          placeholder={disabled ? "" : "Add tags (press Enter)"}
          size="small"
          disabled={disabled}
        />
      )}
      size="small"
      sx={{
        minWidth: 160,
        maxWidth: 320,
        // 44px hit area (MOBILE_UI_PLAN §2) — the "small" outlined field
        // (chips + free-solo input share this box) sat at 40px on phones.
        '& .MuiOutlinedInput-root': {
          minHeight: 44,
        },
      }}
    />
  );
}

// Set default prop for disabled
TagSelector.defaultProps = {
  disabled: false
};

export default TagSelector;