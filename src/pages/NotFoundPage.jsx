import React from 'react'
import { Compass } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function NotFoundPage(){const navigate=useNavigate();return <div className="page-content"><div className="empty-state"><Compass size={34}/><h2>Page not found</h2><p>SmartSync could not find this route, but the prototype is still running safely.</p><button className="primary-button" onClick={()=>navigate('/home')}>Back to discovery</button></div></div>}
