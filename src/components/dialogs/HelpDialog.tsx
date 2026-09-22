import type { ReactNode } from 'react';
import { DialogShell } from './DialogShell';
import { Icon, type IconName } from '../icons/Icon';

interface HelpDialogProps {
  onClose: () => void;
}

function IconRow({ icon, label, children }: { icon: IconName; label: string; children: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <Icon name={icon} size={15} style={{ flexShrink: 0, opacity: 0.7, marginTop: 2 }} />
      <div style={{ fontSize: 13 }}>
        <strong>{label}</strong> — {children}
      </div>
    </div>
  );
}

function Section({ icon, title, defaultOpen, children }: { icon: IconName; title: string; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <details className="help-section" open={defaultOpen} style={{ borderTop: '1px solid var(--color-divider)', paddingTop: 10 }}>
      <summary style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14, listStyle: 'none' }}>
        <Icon name={icon} size={15} />
        <span style={{ flex: 1 }}>{title}</span>
        <Icon name="chevronRight" size={14} className="help-chevron" style={{ opacity: 0.5, transition: 'transform 150ms' }} />
      </summary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10, paddingLeft: 2 }}>
        {children}
      </div>
    </details>
  );
}

// A static reference, not contextual to whichever screen is currently open — this app
// has a lot of icon-only buttons with no visible label, so this exists to answer
// "what does that button do" from anywhere, organized the same way the app itself is
// (a quick-reference section for icons repeated everywhere, then one section per tab).
export function HelpDialog({ onClose }: HelpDialogProps) {
  return (
    <DialogShell title="Help" onClose={onClose}>
      <p className="dialog-body" style={{ margin: 0 }}>What each button does, organized by where you'll find it.</p>
      <div style={{ maxHeight: '65vh', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Section icon="helpCircle" title="Icons you'll see everywhere" defaultOpen>
          <IconRow icon="pencil" label="Pencil">Rename.</IconRow>
          <IconRow icon="trash" label="Trash">
            Delete or remove. Deleting a folder or a Location never deletes what's filed under it — the contents just move up a level / become unfiled instead.
          </IconRow>
          <IconRow icon="gripVertical" label="Grip dots">Press and drag to reorder.</IconRow>
          <IconRow icon="chevronUp" label="Up/down arrows">Move up or down in a list, or expand/collapse a folder.</IconRow>
          <IconRow icon="eye" label="Eye">Preview — opens a live look at this content without needing a paired screen.</IconRow>
          <IconRow icon="mapPin" label="Pin">Move a screen to a different group, or a Location picker.</IconRow>
          <IconRow icon="restart" label="Refresh">Restart the screen.</IconRow>
          <IconRow icon="lightbulb" label="Lightbulb">Identify — blinks that screen's real display so you can tell which physical one it is.</IconRow>
          <IconRow icon="check" label="Checkmark">Save.</IconRow>
          <IconRow icon="move" label="Crosshair arrows">Move to another folder.</IconRow>
        </Section>

        <Section icon="monitor" title="Home (Screens)">
          <IconRow icon="monitor" label="Force content / announcement / blackout (all screens)">
            The orange buttons at the top act on every screen immediately, overriding whatever's scheduled, until you turn it off again.
          </IconRow>
          <IconRow icon="mapPin" label="Add location">
            Creates a purely organizational area — it holds no content of its own, just groups and/or standalone screens, for browsing/managing a whole site at once.
          </IconRow>
          <IconRow icon="grid" label="Add group">
            Creates a group: every screen you put in it shows the exact same content and schedule. "Add group here" inside a Location's box does the same thing, pre-filed there.
          </IconRow>
          <IconRow icon="plus" label="Add a screen">Pairs a new physical display — scan the network, scan its QR code, or type its IP.</IconRow>
          <IconRow icon="chevronUp" label="Up/down arrows on a group">Reorders that group among its siblings.</IconRow>
          <IconRow icon="moon" label="Blackout / Force content / Force announcement on a group">Same actions as the top buttons, scoped to just that group's screens. "Stop" clears an active one.</IconRow>
          <IconRow icon="restart" label="On a screen's own card">Refresh restarts it, pencil renames it, pin moves it to a different group, trash un-pairs it entirely.</IconRow>
        </Section>

        <Section icon="image" title="Library">
          <IconRow icon="image" label="Add image / Add video / Add folder">The three most common actions, always visible; "More options" holds the rest (PDF, announcement, clock, NDI source, TfL status/arrivals boards).</IconRow>
          <IconRow icon="grid" label="Grid / Tree view toggle">Grid browses one folder at a time, like a normal file browser. Tree shows the whole folder hierarchy at once as an expandable outline — quicker for seeing what's where and reorganizing.</IconRow>
          <IconRow icon="check" label="Select">Turns on checkboxes for bulk delete or "Move to folder."</IconRow>
          <IconRow icon="tag" label="Tag icon on a card">Edits that item's search tags.</IconRow>
          <IconRow icon="sliders" label="Sliders icon (NDI/TfL items only)">Reconfigures its source/lines/modes in place, without deleting and re-adding it.</IconRow>
          <IconRow icon="download" label="Download">Downloads the original uploaded file.</IconRow>
        </Section>

        <Section icon="calendar" title="Schedule">
          <IconRow icon="calendar" label="Group tabs along the top">Pick which group's schedule you're viewing/editing.</IconRow>
          <IconRow icon="uploadCloud" label="Add content">Adds to the everyday rolling playlist that plays when nothing else overrides it.</IconRow>
          <IconRow icon="calendar" label="Add event">Schedules specific content for a date range — optionally only during a daily time window — replacing the rolling playlist for just that period.</IconRow>
          <IconRow icon="monitor" label="Standalone screens">Screens with no group get their own compact schedule editor lower down, since they don't share a group's.</IconRow>
        </Section>

        <Section icon="messageCircle" title="Announcements">
          <IconRow icon="messageCircle" label="Force on">Starts a ticker immediately for every screen in the selected group, overriding each screen's own toggle, until you stop it.</IconRow>
          <IconRow icon="calendar" label="Add schedule">Runs an announcement automatically during a date/time window with nobody forcing it manually.</IconRow>
        </Section>

        <Section icon="sliders" title="Settings">
          <IconRow icon="mapPin" label="Locations card">Rename or delete a Location (deleting one never deletes what's filed under it, just un-files it), or add a new one.</IconRow>
          <IconRow icon="check" label="Select screens">Turns on bulk actions: move several screens to one group at once, or file several under one Location at once.</IconRow>
          <IconRow icon="mapPin" label="Location dropdown on a group/screen row">Files or refiles it under a Location without opening a separate dialog.</IconRow>
          <IconRow icon="trash" label="Deleting a group">Only works once it has no screens left in it — move or remove those first.</IconRow>
          <IconRow icon="copy" label="Copy all MAC addresses">Copies every paired screen's name/IP/MAC, for network whitelisting or asset tracking.</IconRow>
          <IconRow icon="download" label="Export / Import backup">Saves or restores everything except the uploaded media files themselves.</IconRow>
        </Section>
      </div>
    </DialogShell>
  );
}
