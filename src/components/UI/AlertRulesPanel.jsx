import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAtlasStore } from '../../store/atlasStore'
import { supabase } from '../../services/supabase'

const TIER_OPTIONS = ['any', 'critical', 'active']
const DOMAIN_OPTIONS = ['any', 'conflict', 'cyber', 'natural', 'humanitarian', 'economic', 'signals', 'hazard']
const CHANNEL_OPTIONS = ['email', 'sms']

function emptyRule(user) {
  return {
    id: crypto.randomUUID(),
    user_id: user.id,
    tier: 'any',
    domain: 'any',
    region: 'global',
    channel: 'email',
    destination: user.email || '',
    enabled: true,
    _isNew: true,
  }
}

export default function AlertRulesPanel({ open, onClose }) {
  const user = useAtlasStore((s) => s.user)
  const mobileMode = useAtlasStore((s) => s.mobileMode)
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
    }
  }, [open, onClose])

  useEffect(() => {
    if (!open || !user || !supabase) return
    setLoading(true)
    supabase
      .from('alert_rules')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        setRules(data || [])
        setLoading(false)
      })
  }, [open, user])

  const addRule = () => {
    if (!user) return
    setRules((prev) => [...prev, emptyRule(user)])
  }

  const updateRule = (id, field, value) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
  }

  const removeRule = async (id) => {
    const rule = rules.find((r) => r.id === id)
    setRules((prev) => prev.filter((r) => r.id !== id))
    if (supabase && rule && !rule._isNew) {
      await supabase.from('alert_rules').delete().eq('id', id)
    }
  }

  const saveAll = async () => {
    if (!supabase || !user) return
    setSaving(true)
    for (const rule of rules) {
      const payload = {
        id: rule.id,
        user_id: user.id,
        tier: rule.tier === 'any' ? null : rule.tier,
        domain: rule.domain === 'any' ? null : rule.domain,
        region: rule.region || 'global',
        channel: rule.channel,
        destination: rule.destination,
        enabled: rule.enabled,
      }
      await supabase.from('alert_rules').upsert(payload)
    }
    setRules((prev) => prev.map((r) => ({ ...r, _isNew: false })))
    setSaving(false)
  }

  if (!user) return null

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.22 }}
          className={`fixed top-[50px] z-[60] max-h-[80vh] overflow-y-auto
                     bg-[rgba(8,12,24,0.96)] border border-white/[0.08] backdrop-blur-xl ${
                       mobileMode
                         ? 'left-4 right-4 w-auto'
                         : 'right-[6px] w-[340px]'
                     }`}
          style={{ fontFamily: 'var(--font-data)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <span className="text-[9px] tracking-[0.3em] text-white/60 uppercase">Alert Rules</span>
            <button onClick={onClose} className="text-[10px] text-white/30 hover:text-white/60 transition-colors">
              ✕
            </button>
          </div>

          <div className="p-4 flex flex-col gap-3">
            {loading ? (
              <p className="text-[9px] tracking-[0.2em] text-white/30 text-center py-6">Loading...</p>
            ) : rules.length === 0 ? (
              <p className="text-[9px] tracking-[0.2em] text-white/30 text-center py-6">
                No alert rules yet. Add one below.
              </p>
            ) : (
              rules.map((rule) => (
                <div key={rule.id} className="border border-white/[0.06] p-3 flex flex-col gap-2">
                  {/* Row 1: Tier + Domain */}
                  <div className="flex gap-2">
                    <label className="flex-1 flex flex-col gap-1">
                      <span className="text-[8px] tracking-[0.2em] text-white/30 uppercase">Tier</span>
                      <select
                        value={rule.tier || 'any'}
                        onChange={(e) => updateRule(rule.id, 'tier', e.target.value)}
                        className="bg-white/[0.04] border border-white/[0.08] text-[9px] text-white/70
                                   py-1.5 px-2 font-mono outline-none focus:border-[var(--accent)]/30"
                      >
                        {TIER_OPTIONS.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex-1 flex flex-col gap-1">
                      <span className="text-[8px] tracking-[0.2em] text-white/30 uppercase">Domain</span>
                      <select
                        value={rule.domain || 'any'}
                        onChange={(e) => updateRule(rule.id, 'domain', e.target.value)}
                        className="bg-white/[0.04] border border-white/[0.08] text-[9px] text-white/70
                                   py-1.5 px-2 font-mono outline-none focus:border-[var(--accent)]/30"
                      >
                        {DOMAIN_OPTIONS.map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {/* Row 2: Channel + Destination */}
                  <div className="flex gap-2">
                    <label className="w-20 flex flex-col gap-1 flex-shrink-0">
                      <span className="text-[8px] tracking-[0.2em] text-white/30 uppercase">Channel</span>
                      <select
                        value={rule.channel}
                        onChange={(e) => updateRule(rule.id, 'channel', e.target.value)}
                        className="bg-white/[0.04] border border-white/[0.08] text-[9px] text-white/70
                                   py-1.5 px-2 font-mono outline-none focus:border-[var(--accent)]/30"
                      >
                        {CHANNEL_OPTIONS.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex-1 flex flex-col gap-1">
                      <span className="text-[8px] tracking-[0.2em] text-white/30 uppercase">
                        {rule.channel === 'sms' ? 'Phone' : 'Email'}
                      </span>
                      <input
                        type={rule.channel === 'sms' ? 'tel' : 'email'}
                        value={rule.destination}
                        onChange={(e) => updateRule(rule.id, 'destination', e.target.value)}
                        placeholder={rule.channel === 'sms' ? '+1234567890' : 'you@email.com'}
                        className="bg-white/[0.04] border border-white/[0.08] text-[9px] text-white/70
                                   py-1.5 px-2 font-mono outline-none focus:border-[var(--accent)]/30
                                   placeholder:text-white/15"
                      />
                    </label>
                  </div>

                  {/* Row 3: Region + Toggle + Delete */}
                  <div className="flex items-center gap-2">
                    <label className="flex-1 flex flex-col gap-1">
                      <span className="text-[8px] tracking-[0.2em] text-white/30 uppercase">Region</span>
                      <input
                        type="text"
                        value={rule.region || 'global'}
                        onChange={(e) => updateRule(rule.id, 'region', e.target.value)}
                        className="bg-white/[0.04] border border-white/[0.08] text-[9px] text-white/70
                                   py-1.5 px-2 font-mono outline-none focus:border-[var(--accent)]/30
                                   placeholder:text-white/15"
                      />
                    </label>
                    <button
                      onClick={() => updateRule(rule.id, 'enabled', !rule.enabled)}
                      className={`mt-4 text-[8px] tracking-[0.15em] uppercase font-mono px-2 py-1 border transition-colors ${
                        rule.enabled
                          ? 'border-[var(--accent)]/30 text-[var(--accent)]/70'
                          : 'border-white/10 text-white/30'
                      }`}
                    >
                      {rule.enabled ? 'On' : 'Off'}
                    </button>
                    <button
                      onClick={() => removeRule(rule.id)}
                      className="mt-4 text-[10px] text-white/20 hover:text-red-400/60 transition-colors px-1"
                      title="Delete rule"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={addRule}
                className="flex-1 py-2 min-h-[36px] border border-white/[0.08] hover:border-white/15
                           text-[9px] tracking-[0.3em] text-white/40 hover:text-white/60
                           font-mono uppercase transition-colors"
              >
                + Add Rule
              </button>
              {rules.length > 0 && (
                <button
                  onClick={saveAll}
                  disabled={saving}
                  className="flex-1 py-2 min-h-[36px] border border-[var(--accent)]/20 hover:border-[var(--accent)]/40
                             text-[9px] tracking-[0.3em] text-[var(--accent)]/60 hover:text-[var(--accent)]
                             font-mono uppercase transition-colors disabled:opacity-30"
                >
                  {saving ? 'Saving...' : 'Save All'}
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
