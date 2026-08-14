import { Check, Radio, Shield, ShoppingBag, Wifi } from "lucide-react";
import { Btn, Card, ScreenHeader } from "../components/ui";

const PRODUCTS = [
  {
    id: "sense",
    name: "Halo Sense",
    tag: "Detector",
    price: "$79",
    icon: Radio,
    tint: "var(--teal)",
    desc: "Measures the magnetic field and radiation right where you live, and adds its own GPS fix — so you see local conditions, not just the global average.",
    features: ["Magnetometer + radiation sensor", "Built-in GPS", "3 months battery life", "Works indoors"],
  },
  {
    id: "boost",
    name: "Halo Boost",
    tag: "Signal strengthener",
    price: "$99",
    icon: Wifi,
    tint: "var(--amber)",
    desc: "Keeps your GPS and radio steady when a storm makes signals unreliable. Sits between your antenna and your equipment.",
    features: ["Filters storm interference", "Works with any GPS receiver", "Mains or 12V powered", "No setup needed"],
  },
  {
    id: "prime",
    name: "Halo Prime",
    tag: "Both, in one device",
    price: "$159",
    icon: Shield,
    tint: "var(--violet)",
    premium: true,
    desc: "Detection and signal protection together. Our most complete device — measures what's happening and keeps you connected through it.",
    features: ["Everything in Sense and Boost", "Weatherproof outdoor housing", "Solar charging option", "2-year warranty"],
  },
];

export function Shop({ onBack }: { onBack: () => void }) {
  return (
    <div className="scroll" style={{ height: "100%", paddingBottom: 96 }}>
      <ScreenHeader eyebrow="Hardware" title="Halo devices" onBack={onBack} right={<ShoppingBag size={20} color="var(--teal)" />} />

      <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 14, color: "var(--mid)", lineHeight: 1.6 }}>
          The app works completely on its own using satellite data. A device adds your own local
          measurements on top — useful if you rely on GPS or radio for work.
        </div>

        {PRODUCTS.map((p) => (
          <Card key={p.id} priority={p.premium} style={p.premium ? { borderColor: "rgba(167,139,250,0.5)" } : undefined}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: p.premium ? 4 : 0 }}>
              <div
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 13,
                  background: `${p.tint}1f`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <p.icon size={21} color={p.tint} />
              </div>
              <div className="mono" style={{ fontSize: 19, fontWeight: 600 }}>
                {p.price}
              </div>
            </div>

            <div className="display" style={{ fontWeight: 700, fontSize: 18, marginTop: 14 }}>
              {p.name}
            </div>
            <div className="eyebrow" style={{ color: p.tint, marginTop: 3 }}>
              {p.tag}
            </div>
            <div style={{ fontSize: 13.5, color: "var(--mid)", marginTop: 10, lineHeight: 1.6 }}>{p.desc}</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
              {p.features.map((f) => (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, color: "var(--mid)" }}>
                  <Check size={14} color={p.tint} style={{ flex: "none" }} />
                  {f}
                </div>
              ))}
            </div>

            <div style={{ marginTop: 18 }}>
              <Btn
                variant={p.premium ? "primary" : "ghost"}
                onClick={() => {
                  window.open(`https://haloguard.app/shop/${p.id}`, "_blank");
                }}
              >
                View {p.name}
              </Btn>
            </div>
          </Card>
        ))}

        <div style={{ fontSize: 11.5, color: "var(--dim)", textAlign: "center", lineHeight: 1.55, padding: "4px 10px" }}>
          Ordering opens the Halo Guard store in your browser.
        </div>
      </div>
    </div>
  );
}
