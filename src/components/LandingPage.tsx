import React, { useEffect, useState } from 'react';
import {
  HeartHandshake,
  Users,
  BookOpen,
  Compass,
  MapPin,
  Mail,
  Phone,
  Clock,
  ArrowRight,
  ShieldCheck,
  X,
} from 'lucide-react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { DEMO_ARTICLES } from '../lib/seedContent.ts';
import { Article, CounselingCategory } from '../types/index.ts';

interface LandingPageProps {
  onStartCounseling: (category?: CounselingCategory) => void;
  onOpenPrivacyModal: () => void;
}

const SERVICES: Array<{
  id: CounselingCategory;
  number: string;
  title: string;
  description: string;
  focus: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'pribadi',
    number: '01',
    title: 'Konseling Pribadi',
    description:
      'Membantu mahasiswa memahami diri secara utuh, mengelola emosi, kecemasan, dan menghadapi dinamika permasalahan pribadi dengan pendekatan empatik.',
    focus: 'Regulasi emosi · Penerimaan diri · Resiliensi mental',
    icon: HeartHandshake,
  },
  {
    id: 'sosial',
    number: '02',
    title: 'Konseling Sosial',
    description:
      'Mendampingi mahasiswa mengembangkan hubungan interpersonal yang sehat, keterampilan komunikasi asertif, dan adaptasi dalam organisasi maupun lingkungan kampus.',
    focus: 'Komunikasi asertif · Relasi sehat · Adaptasi sosial',
    icon: Users,
  },
  {
    id: 'belajar',
    number: '03',
    title: 'Konseling Belajar',
    description:
      'Membantu mengatasi hambatan akademik, prokrastinasi, penurunan motivasi belajar, manajemen waktu kuliah, serta persiapan menghadapi tugas akhir.',
    focus: 'Manajemen waktu · Strategi belajar · Motivasi akademik',
    icon: BookOpen,
  },
  {
    id: 'karier',
    number: '04',
    title: 'Konseling Karier',
    description:
      'Mendampingi mahasiswa mengenali potensi, minat, bakat, dan nilai diri guna merancang arah studi lanjut maupun kesiapan karier profesional.',
    focus: 'Pemetaan minat & bakat · Portofolio · Perencanaan karier',
    icon: Compass,
  },
];

export const LandingPage: React.FC<LandingPageProps> = ({
  onStartCounseling,
  onOpenPrivacyModal,
}) => {
  const { siteAbout } = useAuth();
  const [articles, setArticles] = useState<Article[]>([]);
  const [articleFilter, setArticleFilter] = useState<string>('Semua');
  const [readingArticle, setReadingArticle] = useState<Article | null>(null);

  useEffect(() => {
    const qArticles = query(
      collection(db, 'articles'),
      where('published', '==', true)
    );
    const unsubA = onSnapshot(
      qArticles,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Article, 'id'>) }));
        setArticles(list);
      },
      () => {}
    );

    return () => {
      unsubA();
    };
  }, []);

  const displayedArticles = articles.length > 0 ? articles : DEMO_ARTICLES;
  const usingDemoArticles = articles.length === 0;

  const articleCategories = ['Semua', ...Array.from(new Set(displayedArticles.map((a) => a.category)))];
  const filteredArticles =
    articleFilter === 'Semua'
      ? displayedArticles
      : displayedArticles.filter((a) => a.category === articleFilter);

  return (
    <div className="bg-[#F7F4EC] text-[#1E2B24]">
      {/* Hero Section */}
      <section id="beranda" className="border-b border-[#EAE3D2]">
        <div className="mx-auto max-w-7xl px-6 pt-12 pb-14 lg:pt-16 lg:pb-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
              <p className="text-xs font-semibold tracking-wider text-[#315E4B]">
                Laboratorium Bimbingan dan Konseling · UNUGHA
              </p>
              <h1
                className="font-bold tracking-tight text-[#1E2B24] leading-[1.12]"
                style={{
                  fontSize: 'clamp(2.25rem, 4vw, 3.35rem)',
                  textWrap: 'balance',
                }}
              >
                Kamu Tidak Harus Menghadapi Semuanya Sendirian.
              </h1>
              <p className="text-base sm:text-lg text-[#45564D] leading-relaxed max-w-xl">
                Temukan ruang aman untuk bercerita, mengenali potensi, dan mengembangkan dirimu bersama layanan Bimbingan dan Konseling.
              </p>
              <div className="flex flex-wrap items-center gap-4 pt-2">
                <button
                  type="button"
                  onClick={() => onStartCounseling()}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#315E4B] px-6 py-3.5 text-sm font-semibold text-white hover:bg-[#244738] transition-colors whitespace-nowrap shrink-0"
                >
                  <span>Mulai Konseling</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
                <a
                  href="#layanan"
                  className="inline-flex items-center gap-2 rounded-xl border border-[#C6D4C8] bg-white px-6 py-3.5 text-sm font-semibold text-[#315E4B] hover:bg-[#EBF0EC] transition-colors whitespace-nowrap shrink-0"
                >
                  <span>Pelajari Layanan</span>
                </a>
              </div>
              <p className="text-xs text-[#596B61] pt-1">
                Temukan Ruang untuk Memahami Dirimu · Gratis 100% untuk Mahasiswa UNUGHA
              </p>
            </div>

            <div className="lg:col-span-6">
              <div className="h-full rounded-2xl border border-[#D4E0D5] bg-white p-7 sm:p-8 flex flex-col justify-between space-y-6">
                <div>
                  <p className="text-xs font-semibold tracking-wider text-[#315E4B]">
                    Alur Pendampingan Ruang Tumbuh
                  </p>
                  <h2 className="mt-2 text-xl font-bold text-[#1E2B24]">
                    Tiga Langkah Sederhana Memulai Sesi
                  </h2>
                </div>

                <div className="space-y-5 divide-y divide-[#EAE3D2]">
                  <div className="pt-1">
                    <p className="font-mono text-xs font-semibold text-[#315E4B] tabular-nums">01. Ajukan Kebutuhan</p>
                    <p className="mt-1 text-sm text-[#45564D]">
                      Masuk dengan akun Google, lengkapi data mahasiswa, lalu pilih bidang dan metode konseling (online atau tatap muka).
                    </p>
                  </div>
                  <div className="pt-4">
                    <p className="font-mono text-xs font-semibold text-[#315E4B] tabular-nums">02. Konfirmasi Jadwal</p>
                    <p className="mt-1 text-sm text-[#45564D]">
                      Admin Lab BK menjadwalkan sesi tanpa bentrok dan mengirimkan notifikasi serta ruang virtual untuk sesi online.
                    </p>
                  </div>
                  <div className="pt-4">
                    <p className="font-mono text-xs font-semibold text-[#315E4B] tabular-nums">03. Sesi & Refleksi</p>
                    <p className="mt-1 text-sm text-[#45564D]">
                      Ikuti sesi konseling rahasia bersama konselor dan lanjutkan pendampingan melalui jurnal, mood tracker, serta rencana tindak lanjut.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 4-column trust strip below hero split */}
          <div className="mt-12 grid grid-cols-2 lg:grid-cols-4 gap-6 border-t border-[#EAE3D2] pt-8">
            <div>
              <p className="text-sm font-semibold text-[#315E4B]">Gratis untuk Mahasiswa</p>
              <p className="mt-1 text-xs text-[#596B61] leading-relaxed">
                Seluruh layanan bimbingan dan konseling diberikan tanpa biaya bagi mahasiswa aktif UNUGHA.
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-[#315E4B]">Kerahasiaan Terjaga</p>
              <p className="mt-1 text-xs text-[#596B61] leading-relaxed">
                Isi cerita dan catatan konseling hanya diakses oleh konselor yang berwenang.
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-[#315E4B]">Online & Tatap Muka</p>
              <p className="mt-1 text-xs text-[#596B61] leading-relaxed">
                Pilih sesi video call privat dari mana saja atau pertemuan langsung di Lab BK.
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-[#315E4B]">Pendampingan Terstruktur</p>
              <p className="mt-1 text-xs text-[#596B61] leading-relaxed">
                Dilengkapi jurnal refleksi, mood tracker, asesmen awal, dan tindak lanjut.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Tentang Kami */}
      <section id="tentang" className="bg-white border-b border-[#EAE3D2] py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-stretch">
            <div className="lg:col-span-5">
              <div className="h-full rounded-2xl border border-[#EAE3D2] bg-[#F7F4EC] p-7 sm:p-8 flex flex-col justify-between space-y-6">
                <div className="space-y-3">
                  <p className="text-xs font-semibold tracking-wider text-[#315E4B]">
                    Identitas Layanan
                  </p>
                  <h3 className="text-xl font-bold text-[#1E2B24]">
                    Ruang Aman Berbasis Kode Etik Profesi BK
                  </h3>
                  <p className="text-sm text-[#45564D] leading-relaxed">
                    Seluruh layanan di Laboratorium Bimbingan dan Konseling UNUGHA diselenggarakan gratis untuk mahasiswa dengan pemisahan ketat antara data administratif dan catatan konseling privat.
                  </p>
                </div>

                <div className="space-y-3 border-t border-[#EAE3D2] pt-5 text-xs text-[#45564D]">
                  <p>
                    <strong className="text-[#1E2B24]">Lokasi:</strong> {siteAbout.address}
                  </p>
                  <p>
                    <strong className="text-[#1E2B24]">Jam Layanan:</strong> {siteAbout.serviceHours}
                  </p>
                  <p>
                    <strong className="text-[#1E2B24]">Biaya:</strong> Gratis 100% bagi mahasiswa UNUGHA
                  </p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7 flex flex-col justify-center space-y-6">
              <div>
                <p className="text-xs font-semibold tracking-wider text-[#315E4B]">Tentang Kami</p>
                <h2 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-[#1E2B24]">
                  {siteAbout.labName}
                </h2>
                <p className="mt-3 text-sm sm:text-base text-[#45564D] leading-relaxed">
                  {siteAbout.aboutDescription}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-[#EAE3D2] pt-6">
                <div>
                  <h3 className="text-sm font-bold text-[#315E4B]">Visi</h3>
                  <p className="mt-2 text-sm text-[#45564D] leading-relaxed">{siteAbout.vision}</p>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#315E4B]">Tujuan Pelayanan</h3>
                  <p className="mt-2 text-sm text-[#45564D] leading-relaxed">{siteAbout.goals}</p>
                </div>
              </div>

              <div className="border-t border-[#EAE3D2] pt-5">
                <h3 className="text-sm font-bold text-[#315E4B]">Misi Pelayanan</h3>
                <p className="mt-2 text-sm text-[#45564D] whitespace-pre-line leading-relaxed">
                  {siteAbout.mission}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Layanan */}
      <section id="layanan" className="bg-[#F7F4EC] border-b border-[#EAE3D2] py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold tracking-wider text-[#315E4B]">Layanan Konseling</p>
            <h2 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-[#1E2B24]">
              Empat Bidang Pendampingan Utama Mahasiswa
            </h2>
            <p className="mt-3 text-sm sm:text-base text-[#45564D]">
              Pilih layanan yang paling sesuai dengan kebutuhanmu saat ini. Semua sesi dilakukan secara rahasia dan bebas biaya.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
            {SERVICES.map((service) => {
              const Icon = service.icon;
              return (
                <div
                  key={service.id}
                  className="flex flex-col justify-between rounded-2xl border border-[#EAE3D2] bg-white p-7 transition-colors hover:border-[#A3B8A5]"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold text-[#596B61] tabular-nums">
                        {service.number}. Layanan BK
                      </span>
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EBF0EC] text-[#315E4B]">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </div>
                    </div>
                    <h3 className="text-xl font-bold text-[#1E2B24]">{service.title}</h3>
                    <p className="text-sm text-[#45564D] leading-relaxed">{service.description}</p>
                    <p className="text-xs text-[#596B61] pt-1">{service.focus}</p>
                  </div>

                  <div className="mt-6 pt-5 border-t border-[#EAE3D2]">
                    <button
                      type="button"
                      onClick={() => onStartCounseling(service.id)}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#315E4B] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#244738] transition-colors whitespace-nowrap shrink-0"
                    >
                      <span>Ajukan Konseling</span>
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>



      {/* Artikel Edukasi */}
      <section id="artikel" className="bg-[#F7F4EC] border-b border-[#EAE3D2] py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-xs font-semibold tracking-wider text-[#315E4B]">Artikel Edukasi BK</p>
              <h2 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-[#1E2B24]">
                Bacaan Reflektif & Kesehatan Mental Mahasiswa
              </h2>
              {usingDemoArticles && (
                <p className="mt-1 text-xs text-[#596B61]">
                  Menampilkan artikel contoh demonstrasi. Admin dapat menambah artikel baru dari Dashboard Admin.
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-[#EAE3D2]/60 p-1">
              {articleCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setArticleFilter(cat)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    articleFilter === cat
                      ? 'bg-white text-[#315E4B] shadow-sm'
                      : 'text-[#45564D] hover:text-[#1E2B24]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
            {filteredArticles.map((article) => (
              <article
                key={article.id}
                className="flex flex-col justify-between rounded-2xl border border-[#EAE3D2] bg-white overflow-hidden"
              >
                  <div className="p-6 space-y-3">
                    <div className="flex items-center gap-2 text-xs text-[#596B61]">
                      <span className="font-medium text-[#315E4B]">{article.category}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{article.readMinutes} menit baca</span>
                    </div>
                    <h3 className="text-lg font-bold text-[#1E2B24] leading-snug">{article.title}</h3>
                    <p className="text-sm text-[#45564D] leading-relaxed">{article.excerpt}</p>
                  </div>
                <div className="px-6 pb-6 pt-2">
                  <button
                    type="button"
                    onClick={() => setReadingArticle(article)}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#315E4B] hover:text-[#244738]"
                  >
                    <span>Baca Selengkapnya</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Kontak & Lokasi */}
      <section id="kontak" className="bg-white py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-6 space-y-4">
              <p className="text-xs font-semibold tracking-wider text-[#315E4B]">Kontak & Lokasi</p>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1E2B24]">
                Terhubung dengan Laboratorium BK UNUGHA
              </h2>
              <p className="text-sm sm:text-base text-[#45564D] leading-relaxed">
                Layanan tersedia secara daring melalui video call terenkripsi di Ruang Tumbuh maupun secara tatap muka di kampus UNUGHA Cilacap.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => onStartCounseling()}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#315E4B] px-5 py-3 text-sm font-semibold text-white hover:bg-[#244738]"
                >
                  <span>Ajukan Jadwal Konseling</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-6 rounded-2xl border border-[#EAE3D2] bg-[#F7F4EC] p-7">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-[#315E4B]">
                  <MapPin className="h-4 w-4" />
                  <span>Lokasi Laboratorium</span>
                </div>
                <p className="text-sm text-[#45564D] leading-relaxed">{siteAbout.address}</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-[#315E4B]">
                  <Clock className="h-4 w-4" />
                  <span>Jam Pelayanan</span>
                </div>
                <p className="text-sm text-[#45564D]">{siteAbout.serviceHours}</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-[#315E4B]">
                  <Mail className="h-4 w-4" />
                  <span>Email Resmi</span>
                </div>
                <p className="text-sm text-[#45564D]">{siteAbout.contactEmail}</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-[#315E4B]">
                  <Phone className="h-4 w-4" />
                  <span>Telepon / WhatsApp Lab</span>
                </div>
                <p className="text-sm text-[#45564D] tabular-nums">{siteAbout.contactPhone}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quiet Footer */}
      <footer className="border-t border-[#EAE3D2] bg-[#F7F4EC] py-10">
        <div className="mx-auto max-w-7xl px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-[#596B61]">
          <div className="space-y-1">
            <p className="font-semibold text-[#315E4B]">
              Ruang Tumbuh · Laboratorium Bimbingan dan Konseling UNUGHA
            </p>
            <p>Temukan Ruang untuk Memahami Dirimu. Seluruh layanan bersifat rahasia dan gratis untuk mahasiswa.</p>
          </div>
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={onOpenPrivacyModal}
              className="inline-flex items-center gap-1.5 font-medium text-[#315E4B] hover:underline"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Kebijakan Privasi & Ketentuan Penggunaan</span>
            </button>
          </div>
        </div>
      </footer>

      {/* Article Reader Modal */}
      {readingArticle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#EAE3D2] bg-white p-6 sm:p-8 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-[#596B61]">
                  <span className="font-semibold text-[#315E4B]">{readingArticle.category}</span>
                  <span>·</span>
                  <span>{readingArticle.readMinutes} menit baca</span>
                  <span>·</span>
                  <span>{readingArticle.authorName}</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-[#1E2B24]">{readingArticle.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setReadingArticle(null)}
                className="rounded-lg border border-[#EAE3D2] p-2 text-[#45564D] hover:bg-[#F7F4EC]"
                aria-label="Tutup artikel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="text-sm sm:text-base text-[#35443C] leading-relaxed whitespace-pre-line">
              {readingArticle.content}
            </div>
            <div className="pt-4 border-t border-[#EAE3D2] flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setReadingArticle(null);
                  onStartCounseling();
                }}
                className="rounded-lg bg-[#315E4B] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#244738]"
              >
                Butuh Teman Bicara? Ajukan Konseling
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
