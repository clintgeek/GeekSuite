import React from 'react';
import { Card, CardContent } from '@mui/material';

const CardShell = ({ children, sx }) => (
  <Card sx={{ width: '100%', borderRadius: 2, boxShadow: 1, border: 'none', ...sx }}>
    <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
      {children}
    </CardContent>
  </Card>
);

export default CardShell;


