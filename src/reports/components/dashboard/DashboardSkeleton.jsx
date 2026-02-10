import { Card, CardContent, Grid, Skeleton, Stack } from '@mui/material';

const SkeletonCard = ({ height = 180 }) => (
  <Card sx={{ borderRadius: 18, boxShadow: '0 10px 24px rgba(0,0,0,0.06)' }}>
    <CardContent>
      <Stack spacing={1.5}>
        <Skeleton variant="text" width="40%" />
        <Skeleton variant="rectangular" height={height} />
      </Stack>
    </CardContent>
  </Card>
);

const DashboardSkeleton = () => (
  <Grid container spacing={2} role="status">
    <Grid item xs={12}>
      <Card sx={{ borderRadius: 18, boxShadow: '0 12px 30px rgba(0,0,0,0.08)' }}>
        <CardContent>
          <Stack spacing={2}>
            <Skeleton variant="text" width="30%" height={28} />
            <Skeleton variant="text" width="60%" height={48} />
            <Skeleton variant="rectangular" height={90} />
          </Stack>
        </CardContent>
      </Card>
    </Grid>
    <Grid item xs={12} md={8}>
      <SkeletonCard height={260} />
    </Grid>
    <Grid item xs={12} md={4}>
      <SkeletonCard height={200} />
    </Grid>
    <Grid item xs={12} md={6}>
      <SkeletonCard height={220} />
    </Grid>
    <Grid item xs={12} md={6}>
      <SkeletonCard height={220} />
    </Grid>
  </Grid>
);

export default DashboardSkeleton;
