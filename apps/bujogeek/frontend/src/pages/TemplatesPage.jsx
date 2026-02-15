import { Box, Container } from '@mui/material';
import TemplateList from '../components/templates/TemplateList';
import TemplateApplier from '../components/templates/TemplateApplier';
import TemplateFilters from '../components/templates/TemplateFilters';
import { TemplateProvider } from '../context/TemplateContext';

const TemplatesPage = () => {
  const handleTemplateApplied = (result) => {
    // Handle the applied template result
    console.log('Template applied:', result);
    // You can add additional logic here, such as updating the UI or showing a success message
  };

  return (
    <TemplateProvider>
      <Container maxWidth="lg">
        <Box sx={{ my: 4 }}>
          <TemplateFilters />
          <TemplateList />
          <TemplateApplier onTemplateApplied={handleTemplateApplied} />
        </Box>
      </Container>
    </TemplateProvider>
  );
};

export default TemplatesPage;