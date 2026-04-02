import { useState, useEffect } from 'react';
import { Box, Typography, Chip, Tooltip, CircularProgress } from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Note as NoteIcon,
  Book as BookIcon,
  FitnessCenter as FitnessIcon,
  AutoStories as StoryIcon,
  NatureOutlined as NatureIcon,
  Translate as TranslateIcon,
  Storage as StorageIcon,
  Memory as MemoryIcon,
  DataObject as DataObjectIcon,
  Apps as AppsIcon,
  OpenInNew as OpenInNewIcon,
  Lock as LockIcon,
  Search as SearchIcon,
  GitHub as GitHubIcon,
  ArrowForward as ArrowForwardIcon,
} from '@mui/icons-material';
import axios from 'axios';

// ─── Data ─────────────────────────────────────────────────────────────────────

const iconMap = {
  Dashboard: DashboardIcon, Note: NoteIcon, Book: BookIcon,
  FitnessCenter: FitnessIcon, AutoStories: StoryIcon, NatureOutlined: NatureIcon,
  Translate: TranslateIcon, Storage: StorageIcon, Memory: MemoryIcon,
  DataObject: DataObjectIcon, Apps: AppsIcon,
};
const resolveIcon = (name) => iconMap[name] || DashboardIcon;

const appsData = [
  { name: 'basegeek', displayName: 'baseGeek', description: 'Auth & shared services hub for the entire GeekSuite ecosystem', icon: 'Dashboard', color: '#e8a849', url: 'https://basegeek.clintgeek.com', tag: 'Platform', stack: ['Node.js', 'React', 'MongoDB', 'Redis'] },
  { name: 'notegeek', displayName: 'noteGeek', description: 'Rich markdown notes, linked thinking, and document management', icon: 'Note', color: '#a99df0', url: 'https://notegeek.clintgeek.com', tag: 'Productivity', stack: ['React', 'GraphQL', 'PostgreSQL'] },
  { name: 'bujogeek', displayName: 'bujoGeek', description: 'Digital Bullet Journal — tasks, habits, and rapid logging', icon: 'Book', color: '#d4956a', url: 'https://bujogeek.clintgeek.com', tag: 'Productivity', stack: ['Next.js', 'GraphQL', 'MongoDB'] },
  { name: 'fitnessgeek', displayName: 'fitnessGeek', description: 'Nutrition tracking, macro goals, and fitness logging with mobile support', icon: 'FitnessCenter', color: '#7dac8e', url: 'https://fitnessgeek.clintgeek.com', tag: 'Health', stack: ['React Native', 'FastAPI', 'PostgreSQL'] },
  { name: 'storygeek', displayName: 'storyGeek', description: 'Story outlining, world-building, and long-form creative writing assistant', icon: 'AutoStories', color: '#c76b8e', url: 'https://basegeek.clintgeek.com/login', tag: 'Creative', stack: ['React', 'Ollama', 'MongoDB'] },
  { name: 'flockgeek', displayName: 'flockGeek', description: 'Homestead flock management — tracking, health records, and inventory', icon: 'NatureOutlined', color: '#7dac8e', url: 'https://flockgeek.clintgeek.com', tag: 'Management', stack: ['React', 'Node.js', 'MongoDB'] },
  { name: 'babelgeek', displayName: 'babelGeek', description: 'Language translation, vocabulary building, and learning workflows', icon: 'Translate', color: '#6db5c0', url: 'https://basegeek.clintgeek.com/login', tag: 'Learning', stack: ['React', 'Python', 'Ollama'] },
];

const sidecarsData = [
  { name: 'geekLock', displayName: 'geekLock', description: 'Rust-based AEAD cryptographic sidecar. Handles PII envelope encryption at sub-millisecond overhead for the entire suite.', color: '#e8a849', icon: LockIcon, stack: ['Rust', 'Tokio', 'AES-256-GCM'], repo: 'https://github.com/clintgeek/geekLock' },
  { name: 'geekGrep', displayName: 'geekGrep', description: 'Semantic RAG system. Ingests documents into a local vector store for intelligent, context-aware enterprise search.', color: '#a99df0', icon: SearchIcon, stack: ['Python', 'Streamlit', 'pgvector'], repo: 'https://github.com/clintgeek/geekGrep' },
];

const infraData = [
  { name: 'MongoDB', key: 'mongo', color: '#7dac8e' },
  { name: 'Redis', key: 'redis', color: '#c76b6b' },
  { name: 'InfluxDB', key: 'influx', color: '#6db5c0' },
];

const tagColors = {
  Platform: '#e8a849', Productivity: '#a99df0', Health: '#7dac8e',
  Creative: '#c76b8e', Management: '#7dac8e', Learning: '#6db5c0',
};

// ─── Sub-components ────────────────────────────────────────────────────────────

function StatusDot({ online, checking, size = 7 }) {
  return (
    <Box sx={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      backgroundColor: checking ? '#52525a' : online ? '#7dac8e' : '#c76b6b',
      animation: online ? 'pulse-portal 2.5s ease-in-out infinite' : 'none',
      '@keyframes pulse-portal': {
        '0%, 100%': { opacity: 1, transform: 'scale(1)' },
        '50%': { opacity: 0.6, transform: 'scale(0.85)' },
      },
    }} />
  );
}

function InfraChip({ svc, status }) {
  const online = status?.online;
  const checking = status === undefined;
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 1.5,
      px: 2, py: 1.25, borderRadius: '8px', border: '1px solid',
      borderColor: online ? 'rgba(125,172,142,0.18)' : checking ? 'rgba(255,255,255,0.06)' : 'rgba(199,107,107,0.18)',
      backgroundColor: online ? 'rgba(125,172,142,0.04)' : 'rgba(0,0,0,0.2)',
      minWidth: 140,
    }}>
      <StatusDot online={online} checking={checking} />
      <Box>
        <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'text.primary', lineHeight: 1.2 }}>
          {svc.name}
        </Typography>
        <Typography sx={{ fontSize: '0.6rem', fontFamily: '"Geist Mono", monospace', color: 'text.disabled' }}>
          {checking ? 'checking...' : online ? `${status.latency}ms` : 'offline'}
        </Typography>
      </Box>
    </Box>
  );
}

function AppCard({ app, health }) {
  const AppIcon = resolveIcon(app.icon);
  const online = health?.online;
  const checking = health === undefined;
  const tagColor = tagColors[app.tag] || '#e8a849';

  return (
    <Box
      component="a" href={app.url} target="_blank" rel="noopener noreferrer"
      sx={{
        display: 'flex', flexDirection: 'column', gap: 2,
        p: 3, borderRadius: '14px', border: '1px solid',
        borderColor: 'rgba(255,255,255,0.06)',
        backgroundColor: '#17171b',
        textDecoration: 'none', cursor: 'pointer',
        transition: 'all 220ms ease', position: 'relative', overflow: 'hidden',
        '&::before': {
          content: '""', position: 'absolute', top: 0, left: 0, right: 0, height: '2px',
          backgroundColor: app.color, opacity: 0,
          transition: 'opacity 220ms ease',
        },
        '&:hover': {
          borderColor: `${app.color}35`,
          backgroundColor: `${app.color}07`,
          transform: 'translateY(-3px)',
          boxShadow: `0 12px 32px ${app.color}18`,
          '&::before': { opacity: 1 },
        },
        '&:active': { transform: 'translateY(-1px)' },
      }}
    >
      {/* Status dot */}
      <Box sx={{ position: 'absolute', top: 14, right: 14, display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <StatusDot online={online} checking={checking} />
      </Box>

      {/* Icon + name row */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box sx={{
          width: 42, height: 42, borderRadius: '10px',
          backgroundColor: `${app.color}18`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <AppIcon sx={{ fontSize: 20, color: app.color }} />
        </Box>
        <Box>
          <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: 'text.primary', lineHeight: 1.2 }}>
            {app.displayName}
          </Typography>
          <Chip label={app.tag} size="small" sx={{
            height: 18, fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.04em',
            backgroundColor: `${tagColor}18`, color: tagColor, border: 'none', mt: 0.3,
          }} />
        </Box>
      </Box>

      {/* Description */}
      <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', lineHeight: 1.55, flex: 1 }}>
        {app.description}
      </Typography>

      {/* Stack tags + latency */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6 }}>
        {app.stack.map((s) => (
          <Typography key={s} sx={{
            fontSize: '0.58rem', fontFamily: '"Geist Mono", monospace',
            color: 'text.disabled', px: 0.8, py: 0.2,
            border: '1px solid rgba(255,255,255,0.08)', borderRadius: '4px',
          }}>{s}</Typography>
        ))}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography sx={{ fontSize: '0.62rem', fontFamily: '"Geist Mono", monospace', color: 'text.disabled' }}>
          {checking ? 'checking...' : online ? `${health.latency}ms RTT` : 'offline'}
          {health?.version ? ` · v${health.version}` : ''}
        </Typography>
        <OpenInNewIcon sx={{ fontSize: 13, color: 'text.disabled', opacity: 0.5 }} />
      </Box>
    </Box>
  );
}

function SidecarCard({ svc }) {
  const SvcIcon = svc.icon;
  return (
    <Box sx={{
      p: 3, borderRadius: '14px', border: '1px solid rgba(255,255,255,0.06)',
      backgroundColor: '#17171b', display: 'flex', flexDirection: 'column', gap: 2,
      transition: 'all 220ms ease',
      '&:hover': { borderColor: `${svc.color}30`, transform: 'translateY(-2px)' },
    }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ width: 40, height: 40, borderRadius: '10px', backgroundColor: `${svc.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <SvcIcon sx={{ fontSize: 20, color: svc.color }} />
          </Box>
          <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: 'text.primary' }}>{svc.displayName}</Typography>
        </Box>
        <Tooltip title="View source on GitHub" arrow>
          <Box component="a" href={svc.repo} target="_blank" rel="noopener noreferrer"
            sx={{ display: 'flex', color: 'text.disabled', opacity: 0.6, '&:hover': { opacity: 1 }, transition: 'opacity 150ms' }}>
            <GitHubIcon sx={{ fontSize: 16 }} />
          </Box>
        </Tooltip>
      </Box>
      <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', lineHeight: 1.55 }}>
        {svc.description}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6 }}>
        {svc.stack.map((s) => (
          <Typography key={s} sx={{
            fontSize: '0.58rem', fontFamily: '"Geist Mono", monospace',
            color: 'text.disabled', px: 0.8, py: 0.2,
            border: '1px solid rgba(255,255,255,0.08)', borderRadius: '4px',
          }}>{s}</Typography>
        ))}
      </Box>
    </Box>
  );
}

// ─── Main Portal Page ──────────────────────────────────────────────────────────

export default function PortalPage() {
  const [appHealth, setAppHealth] = useState({});
  const [infraStatus, setInfraStatus] = useState({});
  const [loading, setLoading] = useState(true);

  // Use unauthenticated axios directly — this page is public
  const publicApi = axios.create({ baseURL: '' });

  useEffect(() => {
    const checkInfra = async () => {
      try {
        const res = await publicApi.get('/api/health/infra');
        setInfraStatus(res.data.services || {});
      } catch {
        // All offline if the endpoint itself fails
        const results = {};
        for (const svc of infraData) results[svc.key] = { online: false, latency: null };
        setInfraStatus(results);
      }
    };

    const checkApps = async () => {
      const results = {};
      for (const app of appsData) {
        try {
          const res = await publicApi.get(`/api/health/app/${app.name}`);
          results[app.name] = {
            online: res.data.status === 'online',
            latency: res.data.latency,
            version: res.data.data?.version || null,
          };
        } catch {
          results[app.name] = { online: false, latency: null };
        }
      }
      setAppHealth(results);
    };

    Promise.all([checkInfra(), checkApps()]).then(() => setLoading(false));
    const interval = setInterval(() => { checkInfra(); checkApps(); }, 60000);
    return () => clearInterval(interval);
  }, []);

  const onlineCount = Object.values(appHealth).filter((h) => h?.online).length;
  const totalCount = appsData.length;

  return (
    <Box sx={{
      minHeight: '100vh', background: '#0c0c0f',
      backgroundImage: 'radial-gradient(circle at 20% 20%, rgba(232,168,73,0.04) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(169,157,240,0.03) 0%, transparent 50%)',
      fontFamily: '"Geist", -apple-system, sans-serif',
      color: '#e4dfd6',
    }}>

      {/* ─── Header ─── */}
      <Box sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)', px: { xs: 3, md: 8 }, py: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
            <Typography sx={{ fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-0.02em', color: '#e4dfd6' }}>
              Geek<span style={{ color: '#e8a849' }}>Suite</span>
            </Typography>
            <Box sx={{ px: 1, py: 0.2, borderRadius: '4px', border: '1px solid rgba(232,168,73,0.3)', backgroundColor: 'rgba(232,168,73,0.08)' }}>
              <Typography sx={{ fontSize: '0.55rem', fontFamily: '"Geist Mono", monospace', color: '#e8a849', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                Public Portal
              </Typography>
            </Box>
          </Box>
          <Typography sx={{ fontSize: '0.75rem', fontFamily: '"Geist Mono", monospace', color: '#52525a' }}>
            // geeksuite.clintgeek.com · Containerized · Polyglot · Self-hosted
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {loading ? (
            <CircularProgress size={14} sx={{ color: '#e8a849' }} />
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <StatusDot online={onlineCount === totalCount} checking={false} size={8} />
              <Typography sx={{ fontSize: '0.7rem', fontFamily: '"Geist Mono", monospace', color: 'text.secondary' }}>
                {onlineCount}/{totalCount} online
              </Typography>
            </Box>
          )}
          <Box component="a" href="https://clintgeek.com" target="_blank" rel="noopener noreferrer"
            sx={{ display: 'flex', alignItems: 'center', gap: 0.75, textDecoration: 'none',
              px: 2, py: 1, borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)',
              color: '#8a8690', fontSize: '0.7rem', fontFamily: '"Geist Mono", monospace',
              transition: 'all 150ms', '&:hover': { color: '#e4dfd6', borderColor: 'rgba(255,255,255,0.15)' },
            }}>
            Portfolio <ArrowForwardIcon sx={{ fontSize: 12 }} />
          </Box>
        </Box>
      </Box>

      {/* ─── Main Content ─── */}
      <Box sx={{ maxWidth: 1280, mx: 'auto', px: { xs: 3, md: 8 }, py: 8 }}>

        {/* Hero Blurb */}
        <Box sx={{ mb: 10, maxWidth: 680 }}>
          <Typography sx={{ fontSize: { xs: '2rem', md: '2.8rem' }, fontWeight: 700, letterSpacing: '-0.03em', color: '#e4dfd6', lineHeight: 1.15, mb: 3 }}>
            A polyglot R&D laboratory,<br />
            <span style={{ color: '#e8a849' }}>pressure-tested in production.</span>
          </Typography>
          <Typography sx={{ fontSize: '1rem', color: '#8a8690', lineHeight: 1.7, maxWidth: 520 }}>
            GeekSuite is a self-hosted, containerized ecosystem of applications serving as the internal proving ground for architectures deployed at global enterprise scale. Every pattern here is validated before it ships.
          </Typography>
        </Box>

        {/* ─── Infrastructure Status ─── */}
        <Box sx={{ mb: 10 }}>
          <Typography sx={{ fontSize: '0.65rem', fontFamily: '"Geist Mono", monospace', color: '#52525a', letterSpacing: '0.12em', textTransform: 'uppercase', mb: 2 }}>
            // Infrastructure Layer
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            {infraData.map((svc) => (
              <InfraChip key={svc.key} svc={svc} status={infraStatus[svc.key]} />
            ))}
            <Box sx={{
              display: 'flex', alignItems: 'center', gap: 1.5,
              px: 2, py: 1.25, borderRadius: '8px', border: '1px solid rgba(125,172,142,0.18)',
              backgroundColor: 'rgba(125,172,142,0.04)', minWidth: 140,
            }}>
              <StatusDot online={true} checking={false} />
              <Box>
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'text.primary', lineHeight: 1.2 }}>Nginx</Typography>
                <Typography sx={{ fontSize: '0.6rem', fontFamily: '"Geist Mono", monospace', color: 'text.disabled' }}>TLS 1.3 · A+</Typography>
              </Box>
            </Box>
          </Box>
        </Box>

        {/* ─── Application Directory ─── */}
        <Box sx={{ mb: 10 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
            <Typography sx={{ fontSize: '0.65rem', fontFamily: '"Geist Mono", monospace', color: '#52525a', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              // Application Directory ({totalCount} apps)
            </Typography>
            <Typography sx={{ fontSize: '0.65rem', fontFamily: '"Geist Mono", monospace', color: '#52525a' }}>
              Live health · 60s refresh
            </Typography>
          </Box>
          <Box sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)', xl: 'repeat(4, 1fr)' },
            gap: 2,
          }}>
            {appsData.map((app) => (
              <AppCard key={app.name} app={app} health={appHealth[app.name]} />
            ))}
          </Box>
        </Box>

        {/* ─── Sidecar Services ─── */}
        <Box sx={{ mb: 10 }}>
          <Typography sx={{ fontSize: '0.65rem', fontFamily: '"Geist Mono", monospace', color: '#52525a', letterSpacing: '0.12em', textTransform: 'uppercase', mb: 3 }}>
            // Sidecar Services
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 2 }}>
            {sidecarsData.map((svc) => <SidecarCard key={svc.name} svc={svc} />)}
          </Box>
        </Box>

        {/* ─── Architecture Note ─── */}
        <Box sx={{
          p: 4, borderRadius: '14px',
          border: '1px solid rgba(232,168,73,0.12)',
          background: 'linear-gradient(135deg, rgba(232,168,73,0.04) 0%, rgba(0,0,0,0) 100%)',
        }}>
          <Typography sx={{ fontSize: '0.65rem', fontFamily: '"Geist Mono", monospace', color: '#e8a849', letterSpacing: '0.12em', textTransform: 'uppercase', mb: 2 }}>
            // Architecture Note
          </Typography>
          <Typography sx={{ fontSize: '0.85rem', color: '#8a8690', lineHeight: 1.7, maxWidth: 700 }}>
            All services run on a self-hosted bare-metal server behind a zero-trust Nginx reverse proxy with TLS 1.3 and HSTS enforced at the edge. Authentication is federated via the baseGeek shared-auth layer using JWT tokens. Sensitive data for applicable services is envelope-encrypted at rest using the geekLock Rust sidecar before touching the database layer.
          </Typography>
          <Box sx={{ display: 'flex', gap: 4, mt: 3, flexWrap: 'wrap' }}>
            {[['Nginx', 'Reverse Proxy'], ['Docker', 'Orchestration'], ['Ollama', 'Local LLM'], ['geekLock', 'Cryptography'], ['geekGrep', 'RAG / Search'],].map(([label, sublabel]) => (
              <Box key={label}>
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#e4dfd6' }}>{label}</Typography>
                <Typography sx={{ fontSize: '0.6rem', fontFamily: '"Geist Mono", monospace', color: '#52525a' }}>{sublabel}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      {/* ─── Footer ─── */}
      <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.05)', px: { xs: 3, md: 8 }, py: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Typography sx={{ fontSize: '0.64rem', fontFamily: '"Geist Mono", monospace', color: '#3a3a40' }}>
          GeekSuite · clintgeek.com · Established 1996
        </Typography>
        <Box sx={{ display: 'flex', gap: 3 }}>
          {[['Portfolio', 'https://clintgeek.com'], ['GitHub', 'https://github.com/clintgeek'], ['LinkedIn', 'https://linkedin.com/in/clintcrocker']].map(([label, href]) => (
            <Box key={label} component="a" href={href} target="_blank" rel="noopener noreferrer"
              sx={{ fontSize: '0.64rem', fontFamily: '"Geist Mono", monospace', color: '#52525a', textDecoration: 'none', transition: 'color 150ms', '&:hover': { color: '#e8a849' } }}>
              {label}
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
