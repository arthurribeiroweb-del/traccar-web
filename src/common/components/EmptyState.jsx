import { Button, Stack, Typography } from '@mui/material';

const EmptyState = ({
  title,
  description,
  actionLabel,
  onAction,
}) => (
  <Stack
    spacing={1.5}
    alignItems="center"
    justifyContent="center"
    sx={{
      textAlign: 'center',
      p: 3,
      borderRadius: 3,
      border: (theme) => `1px dashed ${theme.palette.divider}`,
      backgroundColor: (theme) => theme.palette.background.paper,
    }}
  >
    <Typography variant="h6" fontWeight={600}>{title}</Typography>
    {description && (
      <Typography variant="body2" color="text.secondary">
        {description}
      </Typography>
    )}
    {onAction && (
      <Button variant="outlined" color="secondary" onClick={onAction}>
        {actionLabel}
      </Button>
    )}
  </Stack>
);

export default EmptyState;
