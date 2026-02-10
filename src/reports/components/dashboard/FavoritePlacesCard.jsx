import {
  Card,
  CardContent,
  Stack,
  Typography,
  Tooltip,
} from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { formatNumericHours } from '../../../common/util/formatter';
import AddressText from './AddressText';

const FavoritePlacesCard = ({ places, stopsDerived, t }) => (
  <Card
    sx={{
      borderRadius: 18,
      height: '100%',
      boxShadow: '0 10px 24px rgba(0,0,0,0.06)',
    }}
  >
    <CardContent>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Typography variant="subtitle2" color="text.secondary">
          Local favorito
        </Typography>
        {stopsDerived && (
          <Tooltip title="Paradas estimadas por lacunas entre viagens">
            <InfoOutlinedIcon fontSize="small" />
          </Tooltip>
        )}
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        Onde mais ficou parado
      </Typography>
      <Stack spacing={1.5} sx={{ mt: 2 }}>
        {(places || []).length === 0 && (
          <Typography variant="body2" color="text.secondary">
            Sem locais relevantes no período.
          </Typography>
        )}
        {(places || []).map((place, index) => (
          <Stack key={`${place.address}-${index}`} spacing={0.4}>
            <AddressText value={place.address} />
            <Typography variant="caption" color="text.secondary">
              {formatNumericHours(place.stoppedTotal || 0, t)}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </CardContent>
  </Card>
);

export default FavoritePlacesCard;
