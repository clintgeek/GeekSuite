import {
  Card,
  CardContent,
  CardActions,
  Typography,
  Chip,
  Box,
  Button,
} from '@mui/material';
import { CameraAlt, AccessTime, EmojiEvents } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

const ProjectCard = ({ project }) => {
  const navigate = useNavigate();

  const getDifficultyColor = (difficulty) => {
    switch (difficulty) {
      case 'beginner':
        return 'success';
      case 'intermediate':
        return 'warning';
      case 'advanced':
        return 'error';
      default:
        return 'default';
    }
  };

  if (!project) {
    return (
      <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <CardContent sx={{ flexGrow: 1 }}>
          <Typography variant="h6" gutterBottom fontWeight="bold">
            Project unavailable
          </Typography>
          <Typography variant="body2" color="text.secondary">
            We couldn't load the details for this project. Please try refreshing or pick another project.
          </Typography>
        </CardContent>
        <CardActions sx={{ p: 2, pt: 0 }}>
          <Button fullWidth variant="contained" disabled>
            View Details
          </Button>
        </CardActions>
      </Card>
    );
  }

  const difficulty = project.difficulty || 'Unknown';
  const xpReward = project.xpReward ?? '--';
  const techniqueName = project.technique?.name || 'Technique TBD';
  const estimatedTime = project.estimatedTime || 'Time TBD';
  const subject = project.subject || 'Subject TBD';
  const location = project.location || 'Location TBD';

  return (
    <Card
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        transition: 'transform 0.2s, box-shadow 0.2s',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: 4,
        },
      }}
    >
      <CardContent sx={{ flexGrow: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <Chip
            label={difficulty}
            color={getDifficultyColor(difficulty.toLowerCase())}
            size="small"
          />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <EmojiEvents sx={{ fontSize: 16, color: 'primary.main' }} />
            <Typography variant="caption" color="primary">
              {xpReward} XP
            </Typography>
          </Box>
        </Box>

        <Typography variant="h6" gutterBottom fontWeight="bold">
          {project.title || 'Untitled project'}
        </Typography>

        <Typography variant="body2" color="text.secondary" paragraph>
          {project.description || 'Project details coming soon.'}
        </Typography>

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
          <Chip
            icon={<CameraAlt />}
            label={techniqueName}
            size="small"
            variant="outlined"
          />
          <Chip
            icon={<AccessTime />}
            label={estimatedTime}
            size="small"
            variant="outlined"
          />
        </Box>

        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" color="text.secondary" display="block">
            Subject: {subject}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            Location: {location}
          </Typography>
        </Box>
      </CardContent>

      <CardActions sx={{ p: 2, pt: 0 }}>
        <Button
          fullWidth
          variant="contained"
          disabled={!project._id}
          onClick={() => project._id && navigate(`/projects/${ project._id }`)}
        >
          View Details
        </Button>
      </CardActions>
    </Card>
  );
};

export default ProjectCard;
