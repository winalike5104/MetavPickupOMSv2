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
      desc: '创建/编辑订单，处理提货，审核已提货订单。',
      to: '/cn/orders',
      icon: ClipboardList,
      visible: hasPermission(profile, 'View Orders', profile?.email)
    },
    {
      title: '超期处理',
      desc: '处理超期未提货订单并执行结案审核流程。',
      to: '/cn/overdue',
      icon: Clock,
      visible: hasPermission(profile, 'Audit Overdue Orders', profile?.email) || hasPermission(profile, 'View Orders', profile?.email)
    },
    {
      title: '提货通知',
      desc: '在订单列表中发送提货通知邮件。',
      to: '/cn/orders',
      icon: Mail,
      visible: hasPermission(profile, 'View Orders', profile?.email)
    },
    {
      title: '账号管理',
      desc: '创建并管理销售/管理员账号及权限。',
      to: '/cn/users',
      icon: Users,
      visible: isAdmin(profile, profile?.email) || hasPermission(profile, 'Manage Users', profile?.email)
    }
  ];

  return (
    <div className="p-4 md:p-8 overflow-y-auto">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">中国轻量门户</h1>
          <p className="text-slate-500 mt-1">面向销售与管理员的本地直连日常操作入口。</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {cards.filter(c => c.visible).map((card) => (
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

