import React from "react";
import { Container, Typography, Box } from "@mui/material";
import ScriptForm from "./components/ScriptForm";

function App() {
  return (
    <Container maxWidth="md">
      <Box sx={{ py: 6 }}>
        <Typography variant="h3" fontWeight="bold" gutterBottom>
          Inkwise – AI Script Builder
        </Typography>
        <Typography variant="body1" color="text.secondary" gutterBottom>
          Generate YouTube video scripts with Hooks, Body, and CTA in seconds.
        </Typography>
        <ScriptForm />
      </Box>
    </Container>
  );
}

export default App;
