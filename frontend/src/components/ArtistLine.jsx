import React from 'react'
import { Link } from 'react-router-dom'

/**
 * The credited artists for a track: "Ana · Luis · Marta", each linking to their
 * profile. Falls back to the uploader for tracks with no collaboration data.
 * (Revenue-split percentages are kept in the DB for the admin earnings report
 * but never shown to listeners on a song.)
 */
export default function ArtistLine({ track, style, onNavigate }) {
  const artists = (track.artists && track.artists.length)
    ? track.artists
    : [{ user_id: track.user_id, username: track.username, display_name: track.display_name }]

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
