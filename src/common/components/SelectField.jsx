import { useState } from 'react';
import {
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Autocomplete,
  TextField,
  FormHelperText,
} from '@mui/material';
import { useEffectAsync } from '../../reactHelper';
import fetchOrThrow from '../util/fetchOrThrow';

const SelectField = ({
  label,
  fullWidth,
  multiple,
  value = null,
  emptyValue = null,
  emptyTitle = '',
  onChange,
  endpoint,
  data,
  keyGetter = (item) => item.id,
  titleGetter = (item) => item.name,
  helperText,
  disabled,
}) => {
  const [endpointItems, setEndpointItems] = useState();

  const items = data || endpointItems;

  const resolveOptionKey = (option) => (
    typeof option === 'object' && option !== null ? keyGetter(option) : option
  );

  const resolveOption = (option) => {
    if (!option) {
      return null;
    }
    if (typeof option === 'object') {
      return option;
    }
    return items.find((item) => keyGetter(item) === option) || null;
  };

  const getOptionLabel = (option) => {
    const resolved = resolveOption(option);
    return resolved ? titleGetter(resolved) : emptyTitle;
  };

  useEffectAsync(async () => {
    if (endpoint) {
      const response = await fetchOrThrow(endpoint);
      setEndpointItems(await response.json());
    }
  }, []);

  if (items) {
    return (
      <FormControl fullWidth={fullWidth} disabled={disabled}>
        {multiple ? (
          <>
            <InputLabel>{label}</InputLabel>
            <Select
              label={label}
              multiple
              value={value}
              onChange={onChange}
              disabled={disabled}
            >
              {items.map((item) => (
                <MenuItem key={keyGetter(item)} value={keyGetter(item)}>{titleGetter(item)}</MenuItem>
              ))}
            </Select>
            {helperText && <FormHelperText>{helperText}</FormHelperText>}
          </>
        ) : (
          <Autocomplete
            size="small"
            options={items}
            getOptionLabel={getOptionLabel}
            renderOption={(props, option) => (
              <li {...props} key={keyGetter(option)}>{titleGetter(option)}</li>
            )}
            isOptionEqualToValue={(option, selected) => (
              selected != null && keyGetter(option) === resolveOptionKey(selected)
            )}
            value={value}
            onChange={(_, selected) => onChange({ target: { value: selected ? keyGetter(selected) : emptyValue } })}
            disabled={disabled}
            renderInput={(params) => (
              <TextField {...params} label={label} helperText={helperText} disabled={disabled} />
            )}
          />
        )}
      </FormControl>
    );
  }
  return null;
};

export default SelectField;
