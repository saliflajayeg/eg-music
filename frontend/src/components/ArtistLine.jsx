import React from 'react'
import { Link } from 'react-router-dom'

// Roles that read as "this person performed on the track" — they appear on the
// artist line. Production credits (Productor, Mezcla, Máster…) are shown apart
// in a Créditos list instead. Empty role = legacy collaborator = performing.
export const PERFORMING_ROLES = new Set(['', 'Artista invitado', 'Vocalista', 'Corista'])

/**
 * The credited artists for a track: "Ana · Luis · Marta", each linking to their
 * profile. Falls back to the uploader for tracks with no collaboration data.
 * (Revenue-split percentages are kept in the DB for the admin earnings report
 * but never shown to listeners on a song.)
 */
export default function ArtistLine({ track, style, onNavigate }) {
  const all = (track.artists && track.artists.length)
    ? track.artists
    : [{ user_id: track.user_id, username: track.username, display_name: track.display_name }]
  // Only performers on the line; producers/master go in the Créditos list.
  const artists = all.filter(a => a.is_owner || PERFORMING_ROLES.has(a.role || ''))

  return (
    <span style={style}>
      {artists.map((a, i) => (
        <React.Fragment key={a.user_id}>
          {i > 0 && <span style={{opacity:.6}}> · </span>}
          <Link
            to={`/user/${a.user_id}`}
            onClick={e => { e.stopPropagation(); onNavigate?.() }}
            style={{color:'inherit'}}
          >
            {a.display_name || a.username}
          </Link>
        </React.Fragment>
      ))}
    </span>
  )
}
