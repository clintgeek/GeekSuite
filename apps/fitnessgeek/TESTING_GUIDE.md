# FitnessGeek Testing Guide

> **Phase 1: Theme Overhaul**
> **Ready to test!** 🚀

---

## Quick Start

### 1. Start the Dev Server
```bash
cd frontend
npm run dev
```

The app should start on `http://localhost:5173` (or similar)

### 2. What to Look For

**Immediate Visual Changes:**
- ✨ **Inter font** throughout the app (cleaner, modern)
- 🎨 **Gradient background** (subtle blue/purple overlay)
- 🔵 **New blue color** (#2563eb) in AppBar and buttons
- 💊 **Pill-shaped buttons** (fully rounded)
- 🃏 **Softer cards** (24px border-radius, better shadows)
- 🌙 **Theme toggle** button in top-right corner

---

## Testing Checklist

### Visual Testing (Light Mode)

**AppBar:**
- [ ] Modern blue color (#2563eb)
- [ ] Theme toggle button visible in top-right
- [ ] Clean, minimal shadow

**Background:**
- [ ] Subtle gradient overlay visible
- [ ] Smooth color transition from top to bottom

**Typography:**
- [ ] Text looks cleaner (Inter font)
- [ ] Headings have tighter letter-spacing
- [ ] Better readability overall

**Buttons:**
- [ ] Pill-shaped (fully rounded)
- [ ] Gradient background on primary buttons
- [ ] Smooth hover animation (slight lift)
- [ ] No harsh shadows

**Cards:**
- [ ] 24px border-radius (softer corners)
- [ ] Enhanced shadow for depth
- [ ] Hover effect (card lifts slightly)

**Inputs:**
- [ ] 12px border-radius
- [ ] Blue border on focus
- [ ] Smooth transitions

### Dark Mode Testing

**Toggle Dark Mode:**
1. Click the moon/sun icon in top-right
2. Watch the smooth transition

**Check Dark Mode:**
- [ ] Background changes to dark (#020617)
- [ ] Gradient overlay adjusts
- [ ] Text becomes light colored
- [ ] Cards have darker background
- [ ] Primary color becomes lighter blue (#60a5fa)
- [ ] All components remain readable
- [ ] Shadows are more subtle

**Toggle Back:**
- [ ] Smooth transition back to light mode
- [ ] Preference saved (refresh page to verify)

### Component Testing

**Dashboard:**
- [ ] Cards display with new styling
- [ ] Metrics are readable
- [ ] Buttons have gradient effect
- [ ] Hover effects work

**Login/Register:**
- [ ] Input fields have new styling
- [ ] Buttons are pill-shaped
- [ ] Form looks modern

**Food Search:**
- [ ] Search bar has new styling
- [ ] Results display in modern cards
- [ ] Buttons work with new styles

**Navigation:**
- [ ] Drawer opens smoothly
- [ ] List items have hover effects
- [ ] Bottom nav is visible

### Browser Testing

**Chrome/Edge:**
- [ ] All styles render correctly
- [ ] Animations are smooth
- [ ] Dark mode works

**Firefox:**
- [ ] All styles render correctly
- [ ] Animations are smooth
- [ ] Dark mode works

**Safari:**
- [ ] All styles render correctly
- [ ] Animations are smooth
- [ ] Dark mode works

### Mobile Testing (Responsive)

**Mobile View (< 600px):**
- [ ] Layout adjusts properly
- [ ] Buttons are touch-friendly (44px min)
- [ ] Text is readable
- [ ] Theme toggle accessible

**Tablet View (600-960px):**
- [ ] Layout uses available space
- [ ] Cards arrange nicely
- [ ] Navigation works well

---

## Known Behaviors

### Expected:
- **Smooth transitions** when switching themes (0.3s)
- **Gradient background** subtle but visible
- **Pill-shaped buttons** on all primary actions
- **Card hover effects** slight lift on mouse over
- **Theme persistence** preference saved in localStorage

### Not Yet Implemented:
- Login/Register page redesign (Phase 2)
- Advanced animations (Phase 3)
- Empty states (Phase 3)
- Loading spinners (Phase 3)

---

## Troubleshooting

### Font Not Loading?
- Check browser console for errors
- Verify `@fontsource/inter` is installed
- Clear browser cache and refresh

### Dark Mode Not Working?
- Check browser console for errors
- Verify ThemeContext is wrapping the app
- Check localStorage for saved preference

### Styles Look Wrong?
- Hard refresh (Cmd+Shift+R / Ctrl+Shift+F5)
- Clear browser cache
- Check for CSS conflicts in console

### Gradient Not Visible?
- Check if browser supports CSS gradients
- Verify `index.css` loaded correctly
- Try different browser

---

## What's Next?

After testing Phase 1, we'll move to:

**Phase 2: Page Modernization**
- Redesign Login/Register pages
- Modernize Dashboard layout
- Update Food tracking interfaces
- Enhance Health tracking pages

**Phase 3: Component Library**
- Create reusable modern components
- Add framer-motion animations
- Build loading states
- Create empty states

---

## Feedback

As you test, note:
- ✅ **What works well**
- ⚠️ **What needs adjustment**
- 💡 **Ideas for improvements**
- 🐛 **Any bugs or issues**

---

**Happy Testing!** 🎉
