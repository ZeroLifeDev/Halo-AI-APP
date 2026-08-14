import { useMemo, useState } from "react";
import { Award, BookOpen, Check, ChevronRight, Lightbulb, Play, RotateCcw } from "lucide-react";
import { Btn, Card, Pill, ScreenHeader, SpectrumLine, tap } from "../components/ui";
import { LESSONS, LEVEL_COLOR, type Lesson } from "../content/lessons";
import { useStore } from "../lib/store";

export function Learn({ openLesson }: { openLesson: (l: Lesson) => void }) {
  const { lessonsDone } = useStore();
  const [filter, setFilter] = useState<"All" | Lesson["level"]>("All");

  const list = useMemo(
    () => (filter === "All" ? LESSONS : LESSONS.filter((l) => l.level === filter)),
    [filter],
  );
  const done = lessonsDone.length;
  const pct = done / LESSONS.length;

  return (
    <div className="scroll" style={{ height: "100%", paddingBottom: 96 }}>
      <ScreenHeader
        eyebrow={`${done} of ${LESSONS.length} finished`}
        title="Learn"
        right={<BookOpen size={20} color="var(--teal)" />}
      />

      <div style={{ padding: "16px 20px 0" }}>
        <Card priority>
          <div style={{ marginTop: 4, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div className="display" style={{ fontWeight: 700, fontSize: 15 }}>
              {done === 0
                ? "Start with the basics"
                : done === LESSONS.length
                  ? "You've finished everything"
                  : "Keep going"}
            </div>
            <div className="mono" style={{ fontSize: 13, color: "var(--teal)" }}>
              {Math.round(pct * 100)}%
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <SpectrumLine value={Math.max(pct, 0.02)} height={7} />
          </div>
          <div style={{ fontSize: 12.5, color: "var(--mid)", marginTop: 10, lineHeight: 1.5 }}>
            {done === 0
              ? "Fourteen short lessons. By the end you'll understand exactly what the numbers on your dashboard mean."
              : `${LESSONS.length - done} lesson${LESSONS.length - done === 1 ? "" : "s"} left — a few minutes each.`}
          </div>
        </Card>
      </div>

      <div className="scroll" style={{ padding: "16px 20px 0", display: "flex", gap: 8, overflowX: "auto" }}>
        {(["All", "Easy", "Medium", "Hard"] as const).map((f) => (
          <Pill key={f} active={filter === f} onClick={() => setFilter(f)}>
            {f}
          </Pill>
        ))}
      </div>

      <div style={{ padding: "14px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
        {list.map((l) => {
          const complete = lessonsDone.includes(l.id);
          return (
            <Card key={l.id} onClick={() => openLesson(l)}>
              <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    flex: "none",
                    borderRadius: 11,
                    background: complete ? "rgba(45,212,191,0.14)" : "var(--raised)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {complete ? <Check size={18} color="var(--teal)" /> : <Play size={16} color="var(--mid)" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="display" style={{ fontWeight: 600, fontSize: 14.5 }}>
                    {l.title}
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--mid)", marginTop: 2 }}>{l.hook}</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
                    <span className="mono" style={{ fontSize: 10.5, color: LEVEL_COLOR[l.level] }}>
                      {l.level.toUpperCase()}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--dim)" }}>· {l.minutes} min read</span>
                  </div>
                </div>
                <ChevronRight size={16} color="var(--dim)" style={{ flex: "none" }} />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- a single lesson + its quiz ---------------- */

export function LessonView({ lesson, onBack }: { lesson: Lesson; onBack: () => void }) {
  const { markLessonDone, lessonsDone } = useStore();
  const [phase, setPhase] = useState<"read" | "quiz" | "done">("read");
  const [qIdx, setQIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);

  const q = lesson.quiz[qIdx];

  function choose(i: number) {
    if (picked !== null) return;
    tap();
    setPicked(i);
    if (i === q.answer) setScore((s) => s + 1);
  }

  function next() {
    if (qIdx < lesson.quiz.length - 1) {
      setQIdx((n) => n + 1);
      setPicked(null);
    } else {
      markLessonDone(lesson.id);
      setPhase("done");
    }
  }

  return (
    <div className="scroll" style={{ height: "100%", paddingBottom: 40 }}>
      <ScreenHeader
        eyebrow={`${lesson.level} · ${lesson.minutes} min`}
        title={lesson.title}
        onBack={onBack}
      />

      {phase === "read" && (
        <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          {lesson.body.map((p, i) => (
            <p
              key={i}
              style={{
                margin: 0,
                fontSize: 15.5,
                lineHeight: 1.68,
                color: i === 0 ? "var(--hi)" : "var(--mid)",
                fontWeight: i === 0 ? 500 : 400,
              }}
            >
              {p}
            </p>
          ))}

          <Card priority style={{ marginTop: 4 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 4 }}>
              <Lightbulb size={17} color="var(--amber-hi)" style={{ flex: "none", marginTop: 1 }} />
              <div>
                <div className="eyebrow" style={{ marginBottom: 5 }}>Remember this</div>
                <div style={{ fontSize: 14, lineHeight: 1.55 }}>{lesson.takeaway}</div>
              </div>
            </div>
          </Card>

          <Btn onClick={() => setPhase("quiz")} icon={ChevronRight}>
            {lessonsDone.includes(lesson.id) ? "Take the quiz again" : "Check what you learned"}
          </Btn>
        </div>
      )}

      {phase === "quiz" && (
        <div style={{ padding: "18px 20px" }}>
          <div style={{ display: "flex", gap: 5, marginBottom: 20 }}>
            {lesson.quiz.map((_, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 2,
                  background: i < qIdx || (i === qIdx && picked !== null) ? "var(--teal)" : "var(--raised)",
                  transition: "background 250ms ease",
                }}
              />
            ))}
          </div>

          <div className="display" style={{ fontWeight: 600, fontSize: 18, lineHeight: 1.4, marginBottom: 18 }}>
            {q.q}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {q.options.map((opt, i) => {
              let border = "var(--line-2)";
              let bg = "var(--panel)";
              if (picked !== null) {
                if (i === q.answer) {
                  border = "var(--teal)";
                  bg = "rgba(45,212,191,0.10)";
                } else if (i === picked) {
                  border = "var(--red)";
                  bg = "rgba(255,93,108,0.10)";
                }
              }
              return (
                <button
                  key={i}
                  onClick={() => choose(i)}
                  style={{
                    textAlign: "left",
                    padding: "14px 15px",
                    borderRadius: 12,
                    border: `1px solid ${border}`,
                    background: bg,
                    color: "var(--hi)",
                    fontSize: 14,
                    lineHeight: 1.45,
                    cursor: picked === null ? "pointer" : "default",
                    transition: "all 180ms ease",
                  }}
                >
                  {opt}
                </button>
              );
            })}
          </div>

          {picked !== null && (
            <div className="fade-up" style={{ marginTop: 18 }}>
              <Card>
                <div className="eyebrow" style={{ color: picked === q.answer ? "var(--teal)" : "var(--amber)", marginBottom: 6 }}>
                  {picked === q.answer ? "Correct" : "Not quite"}
                </div>
                <div style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--mid)" }}>{q.why}</div>
              </Card>
              <div style={{ marginTop: 14 }}>
                <Btn onClick={next} icon={ChevronRight}>
                  {qIdx < lesson.quiz.length - 1 ? "Next question" : "Finish"}
                </Btn>
              </div>
            </div>
          )}
        </div>
      )}

      {phase === "done" && (
        <div className="fade-up" style={{ padding: "40px 24px", textAlign: "center" }}>
          <Award size={52} color="var(--amber-hi)" style={{ margin: "0 auto 18px" }} />
          <div className="display" style={{ fontWeight: 700, fontSize: 24 }}>
            {score} out of {lesson.quiz.length}
          </div>
          <div style={{ color: "var(--mid)", fontSize: 14.5, marginTop: 10, lineHeight: 1.55 }}>
            {score === lesson.quiz.length
              ? "Perfect. This lesson is marked as finished."
              : "Good effort — this lesson is marked as finished. Read it again any time."}
          </div>
          <div style={{ marginTop: 26, display: "flex", flexDirection: "column", gap: 10 }}>
            <Btn onClick={onBack}>Back to lessons</Btn>
            <Btn
              variant="quiet"
              icon={RotateCcw}
              onClick={() => {
                setPhase("read");
                setQIdx(0);
                setPicked(null);
                setScore(0);
              }}
            >
              Read it again
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}
