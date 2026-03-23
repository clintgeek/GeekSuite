import { useState, useEffect } from 'react';
import {
  Container,
  Box,
  Typography,
  Grid,
  CircularProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import ProjectCard from '../components/ProjectCard';
import projectService from '../services/projectService';

const Projects = () => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    technique: '',
  });

  useEffect(() => {
    fetchProjects();
  }, [filters]);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const data = await projectService.getProjects(filters);
      setProjects(data);
    } catch (err) {
      setError('Failed to load projects. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (filterName) => (event) => {
    setFilters({
      ...filters,
      [filterName]: event.target.value,
    });
  };

  const beginnerProjects = projects.filter((project) => project.difficulty === 'beginner');
  const intermediateProjects = projects.filter(
    (project) => project.difficulty === 'intermediate' || project.difficulty === 'advanced'
  );

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '50vh',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom fontWeight="bold">
        Photography Projects
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        Choose a project to improve your photography skills
      </Typography>

      {/* Filters */}
      <Box sx={{ mb: 4, display: 'flex', gap: 2 }}>
        <FormControl sx={{ minWidth: 200 }}>
          <InputLabel>Technique</InputLabel>
          <Select
            value={filters.technique}
            label="Technique"
            onChange={handleFilterChange('technique')}
          >
            <MenuItem value="">All Techniques</MenuItem>
            <MenuItem value="lighting">Lighting</MenuItem>
            <MenuItem value="composition">Composition</MenuItem>
            <MenuItem value="aperture">Aperture</MenuItem>
            <MenuItem value="shutter-speed">Shutter Speed</MenuItem>
            <MenuItem value="exposure">Exposure</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Projects Grid */}
      {projects.length === 0 ? (
        <Alert severity="info">
          No projects found. Try adjusting your filters.
        </Alert>
      ) : (
        <>
          <Accordion defaultExpanded sx={{ mb: 2 }}>
            <AccordionSummary>
              <Typography variant="h6" fontWeight="bold">
                Beginner Projects
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              {beginnerProjects.length === 0 ? (
                <Alert severity="info">No beginner projects found for these filters.</Alert>
              ) : (
                <Grid container spacing={3}>
                  {beginnerProjects.map((project) => (
                    <Grid item xs={12} sm={6} md={4} key={project._id}>
                      <ProjectCard project={project} />
                    </Grid>
                  ))}
                </Grid>
              )}
            </AccordionDetails>
          </Accordion>

          <Accordion sx={{ mb: 2 }}>
            <AccordionSummary>
              <Typography variant="h6" fontWeight="bold">
                Intermediate &amp; Advanced Projects
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              {intermediateProjects.length === 0 ? (
                <Alert severity="info">No intermediate or advanced projects found for these filters.</Alert>
              ) : (
                <Grid container spacing={3}>
                  {intermediateProjects.map((project) => (
                    <Grid item xs={12} sm={6} md={4} key={project._id}>
                      <ProjectCard project={project} />
                    </Grid>
                  ))}
                </Grid>
              )}
            </AccordionDetails>
          </Accordion>
        </>
      )}
    </Container>
  );
};

export default Projects;
