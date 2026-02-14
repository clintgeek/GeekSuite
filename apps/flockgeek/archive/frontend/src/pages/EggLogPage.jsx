import React, { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { TextField, Button, Stack, Paper, MenuItem } from "@mui/material";
import PageCard from "../components/PageCard.jsx";

export default function EggLogPage() {
  const [groups, setGroups] = useState([]);
  const [form, setForm] = useState({
    groupId: "",
    eggsCount: 0,
    date: new Date().toISOString().slice(0, 10),
    birdIdsSnapshot: "",
  });

  useEffect(() => {
    api.listGroups().then((gs) => {
      setGroups(gs);
      if (gs.length && !form.groupId)
        setForm((f) => ({ ...f, groupId: gs[0]._id }));
    });
  }, []);

  async function onCreate(e) {
    e.preventDefault();
    const raw = form.birdIdsSnapshot.trim();
    let ids;
    if (raw.toLowerCase() === "all") {
      const birds = await api.listBirds({});
      ids = birds.map((b) => b._id);
    } else {
      ids = raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    await api.createEggEntry({
      groupId: form.groupId,
      eggsCount: Number(form.eggsCount),
      date: form.date,
      birdIdsSnapshot: ids,
    });
    setForm({ ...form, eggsCount: 0 });
    alert("Egg entry saved");
  }

  return (
    <Stack spacing={2}>
      <PageCard title="Log Eggs">
        <form onSubmit={onCreate}>
          <Stack spacing={2}>
            <TextField
              select
              label="Group"
              value={form.groupId}
              onChange={(e) => setForm({ ...form, groupId: e.target.value })}
            >
              {groups.map((g) => (
                <MenuItem key={g._id} value={g._id}>
                  {g.name}
                </MenuItem>
              ))}
            </TextField>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                label="Date"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
              <TextField
                label="Eggs Count"
                type="number"
                value={form.eggsCount}
                onChange={(e) =>
                  setForm({ ...form, eggsCount: e.target.value })
                }
              />
            </Stack>
            <TextField
              label="Bird IDs (comma-separated ObjectIds)"
              value={form.birdIdsSnapshot}
              onChange={(e) =>
                setForm({ ...form, birdIdsSnapshot: e.target.value })
              }
            />
            <Button type="submit" variant="contained">
              Save
            </Button>
          </Stack>
        </form>
      </PageCard>
    </Stack>
  );
}
