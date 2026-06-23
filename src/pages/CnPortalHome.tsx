import React from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Clock, Mail, Users, ArrowRight } from 'lucide-react';
import { useAuth } from '../components/AuthProvider';
import { hasPermission, isAdmin } from '../utils';

export const CnPortalHome: React.FC = () => {
  const { profile } = useAuth();

  const cards = [
    {
      title: '订单管理',
      desc: '创建和处理订单，跟进提货、付款与订单状态。',
      to: '/cn/orders',
      icon: ClipboardList,
      visible: hasPermission(profile, 'View Orders', profile?.email)
    },
    {
      title: '超期处理',
      desc: '查看并处理超期未提货订单，完成审核与结案。',
      to: '/cn/overdue',
      icon: Clock,
      visible: hasPermission(profile, 'Audit Overdue Orders', profile?.email) || hasPermission(profile, 'View Orders', profile?.email)
    },
    {
      title: '邮件通知',
      desc: '在订单列表中发送提货通知邮件并跟进发送状态。',
      to: '/cn/orders',
      icon: Mail,
      visible: hasPermission(profile, 'View Orders', profile?.email)
    },
    {
      title: '账号管理',
      desc: '创建并管理销售和管理员账号及权限设置。',
      to: '/cn/users',
      icon: Users,
      visible: isAdmin(profile, profile?.email) || hasPermission(profile, 'Manage Users', profile?.email)
    },
    {
      title: '申请提货',
      desc: '进入提货列表，处理前台需要的提货、已送达和回库。',
      to: '/cn/counter-pickups',
      icon: ClipboardList,
      visible: profile?.roleTemplate === 'Reception' || profile?.roleTemplate === 'Admin' || hasPermission(profile, 'Manage Picking', profile?.email)
    }
  ];

  return (
    <div className="p-4 md:p-8 overflow-y-auto">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">中国轻量门户</h1>
          <p className="text-slate-500 mt-1">面向中国区域用户的本地直连日常操作入口。</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {cards.filter((c) => c.visible).map((card) => (
            <Link
              key={card.title}
              to={card.to}
              className="bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-md transition-all group"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <div className="inline-flex items-center justify-center w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl">
                    <card.icon className="w-5 h-5" />
                  </div>
                  <h2 className="text-lg font-bold text-slate-900">{card.title}</h2>
                  <p className="text-sm text-slate-500">{card.desc}</p>
                </div>
                <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-500 transition-colors" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};
