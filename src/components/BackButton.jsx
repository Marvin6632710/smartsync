import React from 'react'
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function BackButton({ fallback = '/home' }) {
  const navigate = useNavigate()
  return <button className="text-button back-button" onClick={() => window.history.length > 1 ? navigate(-1) : navigate(fallback)}><ArrowLeft size={16} /> Back</button>
}
