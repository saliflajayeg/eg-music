import React, { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

// Shared /track/:id links (their server-rendered Open Graph tags are what social
// crawlers read) just send a human visitor to the canonical player page.
export default function Track() {
  const { id } = useParams()
  const navigate = useNavigate()
  useEffect(() => { navigate('/watch/' + id, { replace: true }) }, [id, navigate])
  return null
}
