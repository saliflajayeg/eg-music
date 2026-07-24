import React from 'react'
import { Link } from 'react-router-dom'

/**
 * The credited artists for a track: "Ana · Luis · Marta", each linking to their
 * profile. Falls back to the uploader for tracks with no collaboration data.
 * `showSplit` adds each artist's percentage (used on the song page).
 */
export default function ArtistLine({ track, style, showSplit = false, onNavigate }) {
  const artists = (track.artists && track.artists.length)
    ? track.artists
    : [{ user_id: track.user_id, username: track.username, display_name: track.display_name, percent: 100 }]

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
          {showSplit && a.percent != null && (
            <span style={{color:'var(--text3)', fontSize:'.85em'}}> {Math.round(a.percent)}%</span>
          )}
        </React.Fragment>
      ))}
    </span>
  )
}
