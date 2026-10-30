import type { Metadata } from "next";
import Link from "next/link";
import { GameArt } from "@/components/GameArt";
import { button } from "@/components/ui/button";
import { getApi } from "@/lib/api";
import styles from "./create.module.css";

export const metadata: Metadata = { title: "Create" };

export default async function CreatePage() {
  const templates = await (await getApi()).listStudioTemplates();
  const [lead, ...rest] = templates;

  return (
    <div className={`page ${styles.create}`}>
      <section className={styles.intro} aria-labelledby="create-title">
        <h1 id="create-title" className={`wide ${styles.title}`}>
          Build games in Metallic Studio
        </h1>
        <p className={styles.lede}>
          Studio is the editor for making Metallic games. Start from a template, test with friends on a private server,
          then publish to Explore when it is ready.
        </p>
        <div className={styles.actions}>
          <Link href="/download#studio" className={button("primary", "large")}>
            Get Metallic Studio
          </Link>
          <a href="#templates" className={button("secondary", "large")}>
            See the templates
          </a>
        </div>
      </section>

      <section id="templates" className={styles.templates} aria-labelledby="templates-title">
        <div className={styles.templatesHead}>
          <h2 id="templates-title" className={styles.h2}>
            Start from a template
          </h2>
          <p className={styles.sub}>Each one opens in Studio as a working game you can play straight away and change.</p>
        </div>

        {lead ? (
          <article className={styles.lead} aria-labelledby={`t-${lead.id}`}>
            <div className={`milled ${styles.leadArt}`}>
              <GameArt art={lead.art} />
            </div>
            <div className={styles.leadText}>
              <h3 id={`t-${lead.id}`} className={`wide ${styles.leadName}`}>
                {lead.name}
              </h3>
              <p>{lead.summary}</p>
              <p className={styles.includes}>Includes: {lead.includes.join(", ")}.</p>
            </div>
          </article>
        ) : null}

        <ul role="list" className={styles.list}>
          {rest.map((t) => (
            <li key={t.id} className={styles.item}>
              <div className={`milled-sm ${styles.itemArt}`}>
                <GameArt art={t.art} />
              </div>
              <div className={styles.itemText}>
                <h3 className={styles.itemName}>{t.name}</h3>
                <p>{t.summary}</p>
                <p className={styles.includes}>Includes: {t.includes.join(", ")}.</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.next} aria-labelledby="next-title">
        <h2 id="next-title" className={styles.h2}>
          Coming to this site for creators
        </h2>
        <ul className={styles.nextList}>
          <li>
            <strong>Game management.</strong> Publish updates, set who can play, and change your game&apos;s page.
          </li>
          <li>
            <strong>Server activity.</strong> See how many servers are running and how full they are.
          </li>
          <li>
            <strong>API documentation.</strong> Reference for the backend APIs your games can call.
          </li>
        </ul>
        <p className={styles.sub}>None of these are live yet. They are on the plan for the creator tools.</p>
      </section>
    </div>
  );
}
