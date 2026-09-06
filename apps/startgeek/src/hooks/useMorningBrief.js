import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from './useSession'
import { useSettings } from './useSettings'
import { gql } from '../lib/graphql'
import { GLANCE_BRIEF } from '../lib/queries'
import {
  isDismissedFor,
  localDayIso,
  shouldRequestBrief,
  writeDismissedDate,
} from '../lib/morningBrief'

/**
 * The morning brief's one fetch (AI_IDEAS.md #5).
 *
 * Deliberately unlike `useGlance`: no poll, no refetch, no interval. The brief
 * is asked for **once**, on the load that first passes all three gates
 * (`shouldRequestBrief`), and then it either sits there or it is dismissed.
 * A brief that re-fetched on a timer would be a second thing on screen
 * competing with the modules it summarizes.
 *
 * Every failure is silence. A gateway error, a network drop, an expired
 * session, a `brief: null` because the server put the hour gate at 5 a.m. too
 * — all of them leave the hero exactly as it was. Nothing about the console
 * waits on this, and nothing about it is worth a toast: the same information
 * is already in the modules two inches below.
 *
 * A tab left open across 5 a.m. does not sprout a brief — the gates are read
 * on mount, not on a clock tick. The next load picks it up, which is what
 * opening the start page in the morning already is.
 */
export function useMorningBrief() {
  const { settings } = useSettings()
  const { status } = useSession()
  const enabled = !!settings.brief
  const signedIn = status === 'in'

  const [brief, setBrief] = useState(null)
  const [provenance, setProvenance] = useState(null)
  const [dismissed, setDismissed] = useState(() => isDismissedFor(localDayIso()))
  const askedRef = useRef(false)

  useEffect(() => {
    if (askedRef.current) return
    if (!shouldRequestBrief({ enabled, signedIn })) return

    askedRef.current = true
    const now = new Date()
    let cancelled = false

    gql(GLANCE_BRIEF, { date: localDayIso(now), localHour: now.getHours() })
      .then((data) => {
        if (cancelled) return
        const result = data?.glanceBrief
        if (!result?.brief) return
        setBrief(result.brief)
        setProvenance(result.provenance || null)
      })
      .catch(() => {
        // Silently absent. The console never waits on the brief and never
        // complains about it — see the module docstring.
      })

    return () => {
      cancelled = true
    }
  }, [enabled, signedIn])

  const dismiss = useCallback(() => {
    writeDismissedDate(localDayIso())
    setDismissed(true)
  }, [])

  return useMemo(
    () => ({ brief: dismissed ? null : brief, provenance, dismiss }),
    [brief, provenance, dismissed, dismiss]
  )
}
