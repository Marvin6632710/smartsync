import React from 'react'
import {
  Bike,
  BookOpen,
  Clapperboard,
  Coffee,
  Dumbbell,
  Footprints,
  Gamepad2,
  Goal,
  PartyPopper,
  Sparkles,
  Ticket,
  UtensilsCrossed,
  Volleyball,
} from 'lucide-react'

const ICONS = {
  football: Goal,
  basketball: Volleyball,
  running: Footprints,
  gym: Dumbbell,
  study: BookOpen,
  coffee: Coffee,
  gaming: Gamepad2,
  hangouts: PartyPopper,
  cycling: Bike,
  movies: Clapperboard,
  food: UtensilsCrossed,
  events: Ticket,
}

export default function CategoryIcon({ category, size = 16 }) {
  const Icon = ICONS[(category || '').toLowerCase()] || Sparkles
  return <Icon size={size} />
}
