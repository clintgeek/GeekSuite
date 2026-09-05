import { useState, useEffect } from 'react';
import { Box, Typography, Chip, Tooltip, CircularProgress, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { brandInk } from '../theme';
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
  const theme = useTheme();
  return (
    <Box sx={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      backgroundColor: checking
        ? theme.palette.text.disabled
        : online ? theme.palette.success.main : theme.palette.error.main,
      animation: online ? 'pulse-portal 2.5s ease-in-out infinite' : 'none',
      '@keyframes pulse-portal': {
        '0%, 100%': { opacity: 1, transform: 'scale(1)' },
        '50%': { opacity: 0.6, transform: 'scale(0.85)' },
      },
    }} />
  );
}

function InfraChip({ svc, status }) {
  const theme = useTheme();
  const online = status?.online;
  const checking = status === undefined;
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 1.5,
      px: 2, py: 1.25, borderRadius: '8px', border: '1px solid',
      borderColor: online
        ? alpha(theme.palette.success.main, 0.18)
        : checking ? theme.palette.divider : alpha(theme.palette.error.main, 0.18),
      backgroundColor: online
        ? alpha(theme.palette.success.main, 0.06)
        : theme.palette.line.hover,
      minWidth: 140,
    }}>
      <StatusDot online={online} checking={checking} />
      <Box>
        <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'text.primary', lineHeight: 1.2 }}>
          {svc.name}
        </Typography>
        <Typography sx={{ fontSize: '0.75rem', fontFamily: '"Geist Mono", monospace', color: 'text.muted' }}>
          {checking ? 'checking...' : online ? `${status.latency}ms` : 'offline'}
        </Typography>
      </Box>
    </Box>
  );
}

function AppCard({ app, health }) {
  const theme = useTheme();
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
        borderColor: 'divider',
        backgroundColor: 'background.paper',
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
          <AppIcon sx={{ fontSize: 20, color: brandInk(theme, app.color) }} />
        </Box>
        <Box>
          <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: 'text.primary', lineHeight: 1.2 }}>
            {app.displayName}
          </Typography>
          <Chip label={app.tag} size="small" sx={{
            height: 20, fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.04em',
            backgroundColor: `${tagColor}18`, color: brandInk(theme, tagColor), border: 'none', mt: 0.3,
            '& .MuiChip-label': { px: 0.9 },
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
            fontSize: '0.75rem', fontFamily: '"Geist Mono", monospace',
            color: 'text.muted', px: 0.8, py: 0.2,
            border: `1px solid ${theme.palette.line.panel}`, borderRadius: '4px',
          }}>{s}</Typography>
        ))}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography sx={{ fontSize: '0.75rem', fontFamily: '"Geist Mono", monospace', color: 'text.muted' }}>
          {checking ? 'checking...' : online ? `${health.latency}ms RTT` : 'offline'}
          {health?.version ? ` · v${health.version}` : ''}
        </Typography>
        <OpenInNewIcon sx={{ fontSize: 13, color: 'text.muted' }} />
      </Box>
    </Box>
  );
}

function SidecarCard({ svc }) {
  const theme = useTheme();
  const SvcIcon = svc.icon;
  return (
    <Box sx={{
      p: 3, borderRadius: '14px', border: '1px solid',
      borderColor: 'divider',
      backgroundColor: 'background.paper', display: 'flex', flexDirection: 'column', gap: 2,
      transition: 'all 220ms ease',
      '&:hover': { borderColor: `${svc.color}30`, transform: 'translateY(-2px)' },
    }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ width: 40, height: 40, borderRadius: '10px', backgroundColor: `${svc.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <SvcIcon sx={{ fontSize: 20, color: brandInk(theme, svc.color) }} />
          </Box>
          <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: 'text.primary' }}>{svc.displayName}</Typography>
        </Box>
        <Tooltip title="View source on GitHub" arrow>
          <Box component="a" href={svc.repo} target="_blank" rel="noopener noreferrer"
            sx={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              minWidth: 44, minHeight: 44, color: 'text.muted',
              '&:hover': { color: 'text.secondary' }, transition: 'color 150ms',
            }}>
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
            fontSize: '0.75rem', fontFamily: '"Geist Mono", monospace',
            color: 'text.muted', px: 0.8, py: 0.2,
            border: `1px solid ${theme.palette.line.panel}`, borderRadius: '4px',
          }}>{s}</Typography>
        ))}
      </Box>
    </Box>
  );
}

// ─── Main Portal Page ──────────────────────────────────────────────────────────

export default function PortalPage() {
  const theme = useTheme();
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
      minHeight: '100vh',
      '@supports (height: 100dvh)': { minHeight: '100dvh' },
      background: theme.palette.surfaces.deep,
      backgroundImage: `radial-gradient(circle at 20% 20%, ${alpha(theme.palette.primary.main, 0.04)} 0%, transparent 50%), radial-gradient(circle at 80% 80%, ${alpha(theme.palette.info.main, 0.03)} 0%, transparent 50%)`,
      fontFamily: '"Geist", -apple-system, sans-serif',
      color: 'text.primary',
    }}>

      {/* ─── Header ─── */}
      <Box sx={{
        borderBottom: '1px solid', borderColor: 'divider', px: { xs: 3, md: 8 }, py: 4,
        display: 'flex', flexDirection: { xs: 'column', sm: 'row' },
        justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, gap: { xs: 2, sm: 0 },
      }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5, flexWrap: 'wrap' }}>
            <Typography sx={{ fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-0.02em', color: 'text.primary' }}>
              Geek<span style={{ color: theme.palette.primary.main }}>Suite</span>
            </Typography>
            <Box sx={{ px: 1, py: 0.2, borderRadius: '4px', border: `1px solid ${theme.palette.glow.border}`, backgroundColor: alpha(theme.palette.primary.main, 0.08) }}>
              <Typography sx={{ fontSize: '0.75rem', fontFamily: '"Geist Mono", monospace', color: 'primary.main', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                Public Portal
              </Typography>
            </Box>
          </Box>
          <Typography sx={{ fontSize: '0.75rem', fontFamily: '"Geist Mono", monospace', color: 'text.secondary' }}>
            // geeksuite.clintgeek.com · Containerized · Polyglot · Self-hosted
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {loading ? (
            <CircularProgress size={14} sx={{ color: 'primary.main' }} />
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <StatusDot online={onlineCount === totalCount} checking={false} size={8} />
              <Typography sx={{ fontSize: '0.75rem', fontFamily: '"Geist Mono", monospace', color: 'text.secondary' }}>
                {onlineCount}/{totalCount} online
              </Typography>
            </Box>
          )}
          <Box component="a" href="https://clintgeek.com" target="_blank" rel="noopener noreferrer"
            sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 0.75, textDecoration: 'none',
              minHeight: 44, px: 2, py: 1, borderRadius: '8px', border: `1px solid ${theme.palette.line.panel}`,
              color: 'text.secondary', fontSize: '0.75rem', fontFamily: '"Geist Mono", monospace',
              transition: 'all 150ms', '&:hover': { color: 'text.primary', borderColor: theme.palette.line.strong },
            }}>
            Portfolio <ArrowForwardIcon sx={{ fontSize: 12 }} />
          </Box>
        </Box>
      </Box>

      {/* ─── Main Content ─── */}
      <Box sx={{ maxWidth: 1280, mx: 'auto', px: { xs: 3, md: 8 }, py: 8 }}>

        {/* Hero Blurb */}
        <Box sx={{ mb: 10, maxWidth: 680 }}>
          <Typography sx={{ fontSize: { xs: '2rem', md: '2.8rem' }, fontWeight: 700, letterSpacing: '-0.03em', color: 'text.primary', lineHeight: 1.15, mb: 3 }}>
            A polyglot R&D laboratory,<br />
            <span style={{ color: theme.palette.primary.main }}>pressure-tested in production.</span>
          </Typography>
          <Typography sx={{ fontSize: '1rem', color: 'text.secondary', lineHeight: 1.7, maxWidth: 520 }}>
            GeekSuite is a self-hosted, containerized ecosystem of applications serving as the internal proving ground for architectures deployed at global enterprise scale. Every pattern here is validated before it ships.
          </Typography>
        </Box>

        {/* ─── Infrastructure Status ─── */}
        <Box sx={{ mb: 10 }}>
          <Typography sx={{ fontSize: '0.75rem', fontFamily: '"Geist Mono", monospace', color: 'text.secondary', letterSpacing: '0.12em', textTransform: 'uppercase', mb: 2 }}>
            // Infrastructure Layer
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            {infraData.map((svc) => (
              <InfraChip key={svc.key} svc={svc} status={infraStatus[svc.key]} />
            ))}
            <Box sx={{
              display: 'flex', alignItems: 'center', gap: 1.5,
              px: 2, py: 1.25, borderRadius: '8px',
              border: `1px solid ${alpha(theme.palette.success.main, 0.18)}`,
              backgroundColor: alpha(theme.palette.success.main, 0.06), minWidth: 140,
            }}>
              <StatusDot online={true} checking={false} />
              <Box>
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'text.primary', lineHeight: 1.2 }}>Nginx</Typography>
                <Typography sx={{ fontSize: '0.75rem', fontFamily: '"Geist Mono", monospace', color: 'text.muted' }}>TLS 1.3 · A+</Typography>
              </Box>
            </Box>
          </Box>
        </Box>

        {/* ─── Application Directory ─── */}
        <Box sx={{ mb: 10 }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 3 }}>
            <Typography sx={{ fontSize: '0.75rem', fontFamily: '"Geist Mono", monospace', color: 'text.secondary', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              // Application Directory ({totalCount} apps)
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', fontFamily: '"Geist Mono", monospace', color: 'text.secondary' }}>
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
          <Typography sx={{ fontSize: '0.75rem', fontFamily: '"Geist Mono", monospace', color: 'text.secondary', letterSpacing: '0.12em', textTransform: 'uppercase', mb: 3 }}>
            // Sidecar Services
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 2 }}>
            {sidecarsData.map((svc) => <SidecarCard key={svc.name} svc={svc} />)}
          </Box>
        </Box>

        {/* ─── Architecture Note ─── */}
        <Box sx={{
          p: 4, borderRadius: '14px',
          border: `1px solid ${alpha(theme.palette.primary.main, 0.12)}`,
          background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.04)} 0%, transparent 100%)`,
        }}>
          <Typography sx={{ fontSize: '0.75rem', fontFamily: '"Geist Mono", monospace', color: 'primary.main', letterSpacing: '0.12em', textTransform: 'uppercase', mb: 2 }}>
            // Architecture Note
          </Typography>
          <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary', lineHeight: 1.7, maxWidth: 700 }}>
            All services run on a self-hosted bare-metal server behind a zero-trust Nginx reverse proxy with TLS 1.3 and HSTS enforced at the edge. Authentication is federated via the baseGeek shared-auth layer using JWT tokens. Sensitive data for applicable services is envelope-encrypted at rest using the geekLock Rust sidecar before touching the database layer.
          </Typography>
          <Box sx={{ display: 'flex', gap: 4, mt: 3, flexWrap: 'wrap' }}>
            {[['Nginx', 'Reverse Proxy'], ['Docker', 'Orchestration'], ['Ollama', 'Local LLM'], ['geekLock', 'Cryptography'], ['geekGrep', 'RAG / Search'],].map(([label, sublabel]) => (
              <Box key={label}>
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'text.primary' }}>{label}</Typography>
                <Typography sx={{ fontSize: '0.75rem', fontFamily: '"Geist Mono", monospace', color: 'text.secondary' }}>{sublabel}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      {/* ─── Footer ─── */}
      <Box sx={{ borderTop: '1px solid', borderColor: 'divider', px: { xs: 3, md: 8 }, py: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Typography sx={{ fontSize: '0.75rem', fontFamily: '"Geist Mono", monospace', color: 'text.muted' }}>
          GeekSuite · clintgeek.com · Established 1996
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {[['Portfolio', 'https://clintgeek.com'], ['GitHub', 'https://github.com/clintgeek'], ['LinkedIn', 'https://linkedin.com/in/clintcrocker']].map(([label, href]) => (
            <Box key={label} component="a" href={href} target="_blank" rel="noopener noreferrer"
              sx={{
                display: 'inline-flex', alignItems: 'center', minHeight: 44, px: 1,
                fontSize: '0.75rem', fontFamily: '"Geist Mono", monospace', color: 'text.secondary',
                textDecoration: 'none', transition: 'color 150ms', '&:hover': { color: 'primary.main' },
              }}>
              {label}
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
