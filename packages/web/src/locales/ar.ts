import type { Dict } from './ru';

// القاموس العربي — يطابق بنية ru.ts. (RTL يُضبط في lib/i18n.ts)
export const ar: Dict = {
  common: {
    save: 'حفظ', cancel: 'إلغاء', delete: 'حذف', send: 'إرسال',
    back: 'رجوع', close: 'إغلاق', search: 'بحث', loading: 'جارٍ التحميل…',
    confirm: 'تأكيد', retry: 'إعادة المحاولة',
  },
  settings: {
    title: 'الإعدادات', appearance: 'المظهر',
    themeDark: 'داكن', themeLight: 'فاتح', themeAuto: 'تلقائي',
    language: 'اللغة', profile: 'الملف الشخصي', security: 'الأمان', privacy: 'الخصوصية',
  },
  auth: {
    tagline: 'تواصل تشعر به',
    e2eBadge: 'الخصوصية افتراضيًا',
    enterPhone: 'أدخل رقمك',
    phoneHint: 'سنرسل رمزًا لمرة واحدة عبر تيليجرام.',
    phoneLabel: 'رقم الهاتف',
    sendCode: 'إرسال الرمز',
    enterCode: 'أدخل الرمز',
    codeSentTo: 'أرسلنا رمزًا من 6 أرقام إلى',
    changeNumber: 'تغيير الرقم',
    terms: 'بالمتابعة، أنت توافق على شروط الخدمة',
  },
  chat: {
    messagePlaceholder: 'رسالة…',
    searchChats: 'بحث في المحادثات…',
    online: 'متصل', offline: 'غير متصل',
    archive: 'الأرشيف', saved: 'الرسائل المحفوظة',
    downloadApp: 'تنزيل التطبيق',
    newChat: 'محادثة جديدة', newGroup: 'مجموعة جديدة', newChannel: 'قناة جديدة',
    settings: 'الإعدادات', logout: 'تسجيل الخروج',
  },
};
