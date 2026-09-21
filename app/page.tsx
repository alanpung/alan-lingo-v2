import Link from "next/link";
import { getSession } from "@/lib/auth-server";
import { DEFAULT_PATH } from "@/lib/constants";
import { FeedbackButton } from "@/components/feedback/feedback-button";

const EXERCISE_TYPES = [
  {
    num: "1",
    icon: "🎯",
    nameZh: "多项选择",
    nameEn: "Multiple choice",
    desc: "根据题目选择最符合语境的选项。",
  },
  {
    num: "2",
    icon: "🌐",
    nameZh: "句子翻译",
    nameEn: "Translation",
    desc: "将句子翻译成英语，系统支持多种正确表达方式。",
  },
  {
    num: "3",
    icon: "✏️",
    nameZh: "填空练习",
    nameEn: "Fill in the blank",
    desc: "在句子的空格处填入正确的单词，巩固语法和词汇。",
  },
  {
    num: "4",
    icon: "🧩",
    nameZh: "单词配对",
    nameEn: "Matching pairs",
    desc: "将英语单词与中文释义进行连线匹配（最适合用来学习新词汇）。",
  },
  {
    num: "5",
    icon: "🎧",
    nameZh: "听力理解",
    nameEn: "Listening (TTS-powered)",
    desc: "听标准英语发音并写下内容，或通过单选、拼句形式进行练习。",
  },
  {
    num: "6",
    icon: "🧱",
    nameZh: "单词拼句",
    nameEn: "Word bank",
    desc: "用零散的单词卡片，按正确的语序拼接成完整的句子。",
  },
  {
    num: "7",
    icon: "🎙️",
    nameZh: "口语朗读",
    nameEn: "Speaking (STT with feedback)",
    desc: "看着英文句子大声读出来，练习发音与流利度。",
  },
  {
    num: "8",
    icon: "📝",
    nameZh: "自由写作",
    nameEn: "Free-text writing",
    desc: "根据提示主题用英语写一段话，我会为您提供详细的语法纠错和更地道的表达建议。",
  },
  {
    num: "9",
    icon: "🎴",
    nameZh: "闪卡复习",
    nameEn: "Flashcard review",
    desc: "经典的双面记忆卡片，用于间隔重复（SRS）的高效复习。",
  },
];

export default async function LandingPage() {
  const session = await getSession();

  return (
    <div className="flex min-h-screen flex-col items-center justify-between bg-lingo-bg px-4 py-8">
      {/* Main content */}
      <main className="max-w-4xl w-full text-center flex flex-col items-center justify-center my-auto pt-6 pb-8">
        {/* Header */}
        <div className="overflow-visible">
          <h1 className="relative z-20 text-6xl font-black text-rainbow tracking-tight pb-6 mb-1 inline-block leading-snug overflow-visible">
            AlanLingo
          </h1>
        </div>
        <p className="relative z-10 text-xl text-lingo-text-light mt-1 mb-2">
          Connecting LLMs to language learning
        </p>
        <p className="text-base text-lingo-text-light mb-8 max-w-lg">
          Create personalised units, read/listen to translated articles and
          practice with AI
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
          {session ? (
            <Link
              href={DEFAULT_PATH}
              className="inline-flex items-center justify-center rounded-2xl bg-lingo-green px-8 py-3 text-lg font-bold uppercase text-white border-b-4 border-lingo-green-dark hover:bg-lingo-green/90 transition-colors"
            >
              Go to App
            </Link>
          ) : (
            <>
              <Link
                href="/sign-up"
                className="inline-flex items-center justify-center rounded-2xl bg-lingo-green px-8 py-3 text-lg font-bold uppercase text-white border-b-4 border-lingo-green-dark hover:bg-lingo-green/90 transition-colors"
              >
                Get Started
              </Link>
              <Link
                href="/sign-in"
                className="inline-flex items-center justify-center rounded-2xl bg-white px-8 py-3 text-lg font-bold uppercase text-lingo-green border-2 border-lingo-border hover:bg-lingo-gray/30 transition-colors"
              >
                I Already Have an Account
              </Link>
            </>
          )}
        </div>

        {/* AI Tutor Question Types */}
        <div className="w-full text-left">
          <div className="mb-6 text-center">
            <h2 className="text-2xl font-black text-lingo-text tracking-tight">
              AI 导师支持的练习题型
            </h2>
            <p className="text-sm text-lingo-text-light mt-1">
              9 Interactive Question Types Powered by LLM & Speech AI
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {EXERCISE_TYPES.map((item) => (
              <div
                key={item.num}
                className="rounded-2xl border-2 border-lingo-border bg-white p-4 shadow-xs hover:border-lingo-blue/40 transition-colors flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl" aria-hidden="true">
                        {item.icon}
                      </span>
                      <div>
                        <div className="font-extrabold text-base text-lingo-text leading-tight">
                          {item.nameZh}
                        </div>
                        <div className="text-xs font-semibold text-lingo-blue">
                          {item.nameEn}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs font-black text-lingo-text-light/60 bg-lingo-bg rounded-full w-6 h-6 flex items-center justify-center border border-lingo-border">
                      {item.num}
                    </span>
                  </div>
                  <p className="text-xs text-lingo-text-light leading-relaxed mt-2">
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Send feedback / Ask for help button at bottom center */}
      <footer className="w-full flex items-center justify-center pb-4 pt-6">
        <FeedbackButton />
      </footer>
    </div>
  );
}
