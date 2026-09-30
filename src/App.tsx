import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Home from '@/pages/Home'
import Share from '@/pages/Share'
import Watch from '@/pages/Watch'

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/share" element={<Share />} />
        <Route path="/watch" element={<Watch />} />
        <Route path="/watch/:code" element={<Watch />} />
      </Routes>
    </Router>
  )
}
