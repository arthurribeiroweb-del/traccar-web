import { useState } from 'react';
import { Tooltip, Typography } from '@mui/material';

const AddressText = ({ value, variant = 'body2' }) => {
  const [expanded, setExpanded] = useState(false);
  const display = value || '--';
  const canToggle = Boolean(value);

  return (
    <Tooltip title={value || ''} disableHoverListener={!value}>
      <Typography
        variant={variant}
        onClick={canToggle ? () => setExpanded((prev) => !prev) : undefined}
        sx={{
          cursor: canToggle ? 'pointer' : 'default',
          whiteSpace: expanded ? 'normal' : 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {display}
      </Typography>
    </Tooltip>
  );
};

export default AddressText;
