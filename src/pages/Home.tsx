import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPinned, Eye, ShieldCheck, Plane, ArrowRight } from 'lucide-react'

export default function Home() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')

  const handleWatch = () => {
    const trimmed = code.trim().toUpperCase()
    if (trimmed) {
      navigate(`/watch/${trimmed}`)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 py-10 relative overflow-hidden">
      {/* 背景装饰 */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-20 w-96 h-96 rounded-full bg-teal/20 blur-3xl" />
        <div className="absolute -bottom-32 -right-20 w-96 h-96 rounded-full bg-sunset/15 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md space-y-8 animate-fade-in">
        {/* 标题区 */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-teal to-teal-dark shadow-lg shadow-teal/30">
            <Plane size={32} className="text-navy-900" />
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            旅行安全定位
          </h1>
          <p className="text-white/60 text-sm leading-relaxed">
            实时共享你的位置与当日轨迹，
            <br />
            让远方的家人安心。
          </p>
        </div>

        {/* 选择卡片 */}
        <div className="space-y-3">
          {/* 共享端 */}
          <button
            onClick={() => navigate('/share')}
            className="group w-full glass rounded-2xl p-5 text-left transition-all hover:border-teal/40 hover:shadow-lg hover:shadow-teal/10 active:scale-[0.98]"
          >
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-teal/15 flex items-center justify-center">
                <MapPinned size={24} className="text-teal" />
              </div>
              <div className="flex-1">
                <div className="font-display font-semibold text-lg">我是旅行者</div>
                <div className="text-sm text-white/55">开启位置共享，生成分享码</div>
              </div>
              <ArrowRight
                size={20}
                className="text-white/30 group-hover:text-teal group-hover:translate-x-1 transition-all"
              />
            </div>
          </button>

          {/* 查看端 */}
          <div className="glass rounded-2xl p-5">
            <div className="flex items-center gap-4 mb-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-sunset/15 flex items-center justify-center">
                <Eye size={24} className="text-sunset" />
              </div>
              <div className="flex-1">
                <div className="font-display font-semibold text-lg">我是家人</div>
                <div className="text-sm text-white/55">输入分享码查看实时位置</div>
              </div>
            </div>
            <div className="flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleWatch()}
                placeholder="输入 6 位分享码"
                maxLength={6}
                className="flex-1 bg-navy-900/60 border border-white/10 rounded-xl px-4 py-3 text-center font-mono text-lg tracking-[0.3em] text-white placeholder:text-white/30 focus:outline-none focus:border-teal/50 transition-colors"
              />
              <button
                onClick={handleWatch}
                disabled={!code.trim()}
                className="px-5 rounded-xl bg-sunset text-navy-900 font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-sunset-dark transition-colors active:scale-95"
              >
                查看
              </button>
            </div>
          </div>
        </div>

        {/* 安全提示 */}
        <div className="flex items-start gap-2 text-xs text-white/40">
          <ShieldCheck size={16} className="flex-shrink-0 mt-0.5 text-teal/60" />
          <p>
            位置数据仅在共享期间存储于本地服务器，停止共享后可随时清除。建议在 HTTPS 环境下使用以获取精确定位。
          </p>
        </div>
      </div>
    </div>
  )
}
