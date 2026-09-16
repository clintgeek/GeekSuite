import React, { useState } from 'react';
import {
  Box,
  TextField,
  InputAdornment,
  IconButton,
  CircularProgress,
  Tooltip,
  useTheme
} from '@mui/material';
import {
  Search as SearchIcon,
  QrCodeScanner as BarcodeIcon,
  SmartToy as AIIcon,
  Clear as ClearIcon
} from '@mui/icons-material';

/**
 * The box.
 *
 * There is no send arrow any more: the search runs as you type (150ms to your
 * own catalog, 400ms to the food databases), so a button that means "now
 * actually search" is a button that means "the last four seconds of typing did
 * nothing". Enter still works — it skips the second wait.
 */
const SearchBar = ({
  value,
  onChange,
  onSubmit,
  onBarcodeClick,
  onAIClick,
  loading = false,
  // Every real mount passes its own; this default is only a fallback, and it
  // deliberately no longer promises describe-and-log, which depends on the
  // host wiring `onDescribe`.
  placeholder = "Search foods",
  autoFocus = false
}) => {
  const theme = useTheme();
  const [isFocused, setIsFocused] = useState(false);

  const handleClear = () => {
    onChange({ target: { value: '' } });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <Box
      sx={{
        position: 'relative',
        mb: 3
      }}
    >
      <TextField
        fullWidth
        value={value}
        onChange={onChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon sx={{ color: isFocused ? theme.palette.primary.main : theme.palette.text.secondary, fontSize: 28 }} />
            </InputAdornment>
          ),
          endAdornment: (
            <InputAdornment position="end">
              <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                {loading && (
                  <CircularProgress
                    size={20}
                    sx={{
                      color: theme.palette.primary.main,
                      mr: 1
                    }}
                  />
                )}
                {value && !loading && (
                  <IconButton
                    size="small"
                    // Only rendered once the box has text, which is why the
                    // harness never caught it missing: the scene that covers
                    // this surface had been skipping since 2026-09-14 and
                    // never typed anything.
                    aria-label="Clear search"
                    onClick={handleClear}
                    sx={{
                      color: theme.palette.text.secondary,
                      '&:hover': {
                        color: theme.palette.text.primary,
                        backgroundColor: theme.palette.action.hover
                      }
                    }}
                  >
                    <ClearIcon fontSize="small" />
                  </IconButton>
                )}
                {onBarcodeClick && (
                  <Tooltip title="Scan Barcode" arrow>
                    <IconButton
                      aria-label="Scan barcode"
                      onClick={onBarcodeClick}
                      sx={{
                        color: theme.palette.text.secondary,
                        transition: 'all 0.15s ease',
                        '&:hover': {
                          color: theme.palette.primary.main,
                          backgroundColor: `${theme.palette.primary.main}1a`,
                        }
                      }}
                    >
                      <BarcodeIcon />
                    </IconButton>
                  </Tooltip>
                )}
                {onAIClick && (
                  <Tooltip title="AI Parse" arrow>
                    <IconButton
                      aria-label="Parse with AI"
                      onClick={onAIClick}
                      sx={{
                        color: theme.palette.text.secondary,
                        transition: 'all 0.15s ease',
                        '&:hover': {
                          color: theme.palette.primary.main,
                          backgroundColor: `${theme.palette.primary.main}1a`,
                        }
                      }}
                    >
                      <AIIcon />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            </InputAdornment>
          )
        }}
        sx={{
          '& .MuiOutlinedInput-root': {
            borderRadius: '12px',
            fontSize: '1.0625rem',
            py: 1,
            px: 1.5,
            color: theme.palette.text.primary,
            backgroundColor: theme.palette.background.paper,
            transition: 'all 0.15s ease',
            '& fieldset': {
              borderColor: isFocused ? theme.palette.primary.main : theme.palette.divider,
              borderWidth: isFocused ? 2 : 1,
            },
            '&:hover fieldset': {
              borderColor: theme.palette.primary.main,
            },
            '&.Mui-focused fieldset': {
              borderColor: theme.palette.primary.main,
              borderWidth: 2,
            }
          },
          '& .MuiInputBase-input': {
            color: theme.palette.text.primary,
            '&::placeholder': {
              color: theme.palette.text.secondary,
              opacity: 1
            }
          }
        }}
      />
    </Box>
  );
};

export default SearchBar;
