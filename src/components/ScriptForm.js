import React, { useState } from "react";
import {
  TextField,
  Button,
  Box,
  Typography,
  MenuItem,
  CircularProgress,
  Paper,
  Alert,
} from "@mui/material";

function ScriptForm() {
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("Funny");
  const [loading, setLoading] = useState(false);
  const [script, setScript] = useState("");
  const [error, setError] = useState("");

  const handleGenerate = async () => {
    setLoading(true);
    setScript("");
    setError("");

    try {
      const res = await fetch(process.env.REACT_APP_API_URL + "/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization":`Bearer ${process.env.REACT_APP_API_KEY}` },
        body: JSON.stringify({ topic, tone }),
      });

      if (res.status === 429) {
        setError(
          "We’re getting a lot of traffic right now. Please try again in a few seconds."
        );
        setLoading(false);
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      const data = await res.json();
      setScript(data.script);
    } catch (e) {
      setError(e.message || "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      <TextField
        fullWidth
        label="Enter video topic"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        margin="normal"
      />

      <TextField
        select
        fullWidth
        label="Select Tone"
        value={tone}
        onChange={(e) => setTone(e.target.value)}
        margin="normal"
      >
        <MenuItem value="Funny">Funny</MenuItem>
        <MenuItem value="Serious">Serious</MenuItem>
        <MenuItem value="Inspirational">Inspirational</MenuItem>
        <MenuItem value="Edgy">Edgy</MenuItem>
        <MenuItem value="Neutral">Neutral</MenuItem>
      </TextField>

      <Button
        variant="contained"
        onClick={handleGenerate}
        disabled={loading || !topic.trim()}
        sx={{ mt: 2 }}
      >
        {loading ? <CircularProgress size={24} /> : "Generate Script"}
      </Button>

      {error && (
        <Alert severity="warning" sx={{ mt: 3 }}>
          {error}
        </Alert>
      )}

      {script && (
        <Paper sx={{ mt: 4, p: 3, whiteSpace: "pre-wrap", bgcolor: "#f5f5f5" }}>
          <Typography variant="h6" gutterBottom>
            Generated Script
          </Typography>
          <Typography variant="body1">{script}</Typography>
        </Paper>
      )}
    </Box>
  );
}

export default ScriptForm;
