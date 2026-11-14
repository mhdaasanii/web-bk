import { Article, CounselorProfile, SiteAboutContent } from '../types/index.ts';

export const BOOTSTRAP_ADMIN_EMAIL = 'mihsani.24ci10027@mhs.unugha.ac.id';

export const DEFAULT_ABOUT_CONTENT: SiteAboutContent = {
  key: 'about',
  labName: 'Laboratorium Bimbingan dan Konseling (Lab BK) UNUGHA',
  aboutDescription:
    'Ruang Tumbuh adalah platform layanan digital resmi Laboratorium Bimbingan dan Konseling Universitas Nahdlatul Ulama Al Ghazali (UNUGHA) Cilacap. Seluruh layanan konseling diselenggarakan secara gratis, rahasia, dan profesional untuk mendampingi mahasiswa bertumbuh secara pribadi, sosial, akademik, maupun karier.',
  vision:
    'Menjadi pusat layanan bimbingan dan konseling perguruan tinggi yang humanis, aman, inklusif, dan berbasis keilmuan dalam mendampingi kesehatan mental serta pengembangan potensi mahasiswa UNUGHA.',
  mission:
    '1. Menyediakan layanan konseling individual gratis secara daring maupun tatap muka.\n2. Menjaga kerahasiaan data pribadi dan catatan konseling mahasiswa sesuai kode etik profesi BK.\n3. Mengembangkan program asesmen diri, literasi kesehatan mental, dan pendampingan karier mahasiswa.',
  goals:
    'Membantu mahasiswa mengenali potensi diri, mengelola tantangan emosional dan akademik secara sehat, membangun relasi sosial yang suportif, serta merancang masa depan karier dengan percaya diri.',
  address: 'Gedung Layanan Mahasiswa Lt. 2, Kampus UNUGHA, Jl. Kemerdekaan Barat No. 17, Kesugihan, Cilacap',
  contactEmail: 'lab.bk@unugha.ac.id',
  contactPhone: '(0282) 695-412 / +62 812-2800-4410',
  serviceHours: 'Senin – Jumat, 08.00 – 16.00 WIB',
  retentionDays: 365,
  videoWindowMinutesBefore: 15,
};

export const DEMO_COUNSELORS: CounselorProfile[] = [
  {
    uid: 'demo-counselor-1',
    fullName: 'Aulia Rahmawati, M.Pd., Kons.',
    title: 'Konselor Akademik & Kesehatan Mental (Contoh Data)',
    specializations: ['Pribadi', 'Belajar'],
    bio: 'Berpengalaman mendampingi mahasiswa dalam regulasi emosi, kecemasan akademik, dan penyesuaian diri di lingkungan kampus.',
    photoUrl: '/src/assets/images/counselor_portrait_1_1794662997580.jpg',
    isActive: true,
    availability: ['Senin 09:00-12:00', 'Rabu 13:00-16:00', 'Jumat 09:00-11:30'],
    maxWeeklySessions: 12,
  },
  {
    uid: 'demo-counselor-2',
    fullName: 'Dr. Fajar Hidayatullah, M.Psi.',
    title: 'Konselor Karier & Relasi Sosial (Contoh Data)',
    specializations: ['Sosial', 'Karier'],
    bio: 'Fokus pada pengembangan keterampilan interpersonal, kepemimpinan mahasiswa, pemetaan bakat, serta perencanaan transisi karier pascakampus.',
    photoUrl: '/src/assets/images/counselor_portrait_2_1794662997371.jpg',
    isActive: true,
    availability: ['Selasa 09:00-12:00', 'Kamis 10:00-15:00'],
    maxWeeklySessions: 10,
  },
];

export const DEMO_ARTICLES: Article[] = [
  {
    id: 'demo-article-1',
    title: 'Mengelola Burnout Akademik di Tengah Padatnya Tugas Kuliah',
    category: 'Manajemen Stres',
    excerpt:
      'Kenali tanda awal kelelahan emosional selama perkuliahan dan langkah praktis memulihkan energi belajar tanpa rasa bersalah.',
    content:
      'Burnout akademik bukan sekadar rasa lelah biasa setelah begadang mengerjakan tugas. Kondisi ini ditandai oleh kelelahan emosional yang menetap, menurunnya motivasi belajar, serta munculnya rasa sinis terhadap aktivitas perkuliahan.\n\nLangkah pertama yang dapat dilakukan mahasiswa adalah memetakan ulang beban mingguan menggunakan teknik prioritas realistis. Sisihkan waktu istirahat terstruktur minimal 20 menit di antara blok belajar dan hindari membandingkan ritme belajar diri sendiri dengan orang lain.\n\nJika rasa kewalahan berlangsung lebih dari dua minggu hingga mengganggu tidur dan relasi sosial, jangan ragu memanfaatkan layanan konseling gratis di Laboratorium BK UNUGHA melalui Ruang Tumbuh.',
    coverImage: '/src/assets/images/article_mental_health_1794662997735.jpg',
    authorName: 'Tim Lab BK UNUGHA (Contoh Artikel)',
    readMinutes: 4,
    published: true,
  },
  {
    id: 'demo-article-2',
    title: 'Seni Membangun Batasan Sehat dalam Pertemanan dan Organisasi Kampus',
    category: 'Pengembangan Diri',
    excerpt:
      'Belajar berkata tidak dengan asertif membantu menjaga kesehatan mental sekaligus memperkuat kualitas hubungan interpersonal.',
    content:
      'Mahasiswa sering kali merasa kesulitan menolak ajakan atau tambahan tanggung jawab kepanitiaan karena khawatir dianggap tidak solid. Padahal, batasan personal (personal boundaries) yang jelas adalah fondasi dari relasi yang saling menghargai.\n\nKomunikasi asertif dapat dimulai dari kalimat yang jujur namun hangat, misalnya menyampaikan kapasitas waktu yang tersedia secara spesifik dan menawarkan alternatif kontribusi yang tetap realistis.\n\nMelalui layanan Konseling Sosial di Ruang Tumbuh, kamu dapat berlatih pola komunikasi asertif bersama konselor profesional.',
    coverImage: '/src/assets/images/about_lab_bk_unugha_1794662997456.jpg',
    authorName: 'Tim Lab BK UNUGHA (Contoh Artikel)',
    readMinutes: 5,
    published: true,
  },
  {
    id: 'demo-article-3',
    title: 'Menemukan Arah Karier Sejak Semester Awal Tanpa Terburu-buru',
    category: 'Akademik & Karier',
    excerpt:
      'Mengenali irisan antara minat, nilai pribadi, dan kompetensi untuk merancang portofolio kuliah yang bermakna.',
    content:
      'Perencanaan karier tidak harus menunggu semester akhir. Sejak semester awal, mahasiswa dapat mulai bereksplorasi melalui mata kuliah pilihan, proyek kolaboratif, maupun kegiatan pengabdian masyarakat.\n\nCatat aktivitas yang membuatmu merasa berenergi serta keterampilan apa yang ingin diasah dalam enam bulan ke depan. Evaluasi berkala bersama konselor karier dapat membantumu memetakan langkah yang terukur.',
    coverImage: '/src/assets/images/hero_counseling_calm_1794662997320.jpg',
    authorName: 'Tim Lab BK UNUGHA (Contoh Artikel)',
    readMinutes: 4,
    published: true,
  },
];

export const STUDY_PROGRAMS_UNUGHA = [
  'Bimbingan dan Konseling',
  'Pendidikan Agama Islam',
  'Pendidikan Guru Madrasah Ibtidaiyah',
  'Informatika',
  'Teknik Industri',
  'Teknik Mesin',
  'Teknik Kimia',
  'Manajemen',
  'Ekonomi Syariah',
  'Hukum Ekonomi Syariah',
  'Matematika',
  'Lainnya',
];
