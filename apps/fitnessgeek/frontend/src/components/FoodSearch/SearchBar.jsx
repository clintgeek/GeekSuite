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
  Clear as ClearIcon,
  Send as SendIcon
} from '@mui/icons-material';

const SearchBar = ({
  value,
  onChange,
  onSubmit,
  onBarcodeClick,
  onAIClick,
  loading = false,
  placeholder = "Search foods, scan barcode, or describe your meal...",
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
                {onSubmit && value && (
                  <Tooltip title="Search" arrow>
                    <IconButton
                      onClick={onSubmit}
                      disabled={loading || !value.trim()}
                      sx={{
                        color: theme.palette.primary.main,
                        backgroundColor: `${theme.palette.primary.main}1a`,
                        transition: 'all 0.15s ease',
                        '&:hover': {
                          color: theme.palette.primary.contrastText,
                          backgroundColor: theme.palette.primary.main,
                        },
                        '&.Mui-disabled': {
                          color: theme.palette.action.disabled,
                          backgroundColor: theme.palette.action.disabledBackground
                        }
                      }}
                    >
                      <SendIcon />
                    </IconButton>
                  </Tooltip>
                )}
                {onBarcodeClick && (
                  <Tooltip title="Scan Barcode" arrow>
                    <IconButton
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
