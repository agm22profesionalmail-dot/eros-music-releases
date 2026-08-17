import { useT } from '../../app/i18n'
import { Card } from '../Card'
import { onboardingDemo } from '../../data/onboardingDemoData'
import {
  SearchIcon,
  HeadphonesIcon,
  SparkleIcon,
  ChartIcon
} from '../Icons'

/**
 * F61 · Tour de funciones clave con la muestra real embebida (playlist
 * "Summer Feels", canciones de "Me gusta" y artistas de la cuenta del creador,
 * ver onboardingDemoData). Todo el panel de demo es inerte
 * (`pointer-events: none`): reutilizamos `Card` tal cual, pero nada navega ni
 * reproduce — es un escaparate, no la app real.
 */
export function StepTour(): React.JSX.Element {
  const t = useT()
  const demo = onboardingDemo

  const features: { icon: React.JSX.Element; text: string }[] = [
    { icon: <SearchIcon size={18} />, text: t('onboarding.tour.search') },
    { icon: <HeadphonesIcon size={18} />, text: t('onboarding.tour.playlists') },
    { icon: <SparkleIcon size={18} />, text: t('onboarding.tour.lyrics') },
    { icon: <ChartIcon size={18} />, text: t('onboarding.tour.downloads') }
  ]

  return (
    <div className="onb-step onb-step-tour">
      <h1>{t('onboarding.tour.title')}</h1>
      <p className="onb-lead">{t('onboarding.tour.body')}</p>

      <ul className="onb-features">
        {features.map((f, i) => (
          <li key={i}>
            <span className="onb-feature-icon">{f.icon}</span>
            {f.text}
          </li>
        ))}
      </ul>

      {demo.hasContent ? (
        <>
          <div className="onb-demo-panel" aria-hidden="true">
            {demo.playlist && (
              <div className="onb-demo-col onb-demo-playlist">
                <div className="onb-demo-label">{t('onboarding.tour.playlistLabel')}</div>
                <Card
                  item={{
                    ...demo.playlist,
                    subtitle: t('media.songCount', { n: demo.playlistTracks.length })
                  }}
                />
              </div>
            )}
            <div className="onb-demo-col onb-demo-liked">
              <div className="onb-demo-label">{t('onboarding.tour.likedLabel')}</div>
              <ul className="onb-demo-tracks">
                {demo.likedTracks.slice(0, 5).map((tr) => (
                  <li key={tr.videoId}>
                    {tr.thumbnailUrl && <img src={tr.thumbnailUrl} alt="" />}
                    <div className="onb-demo-track-meta">
                      <div className="title">{tr.title}</div>
                      <div className="artists">{tr.artists.map((a) => a.name).join(', ')}</div>
                    </div>
                    {tr.durationText && <span className="dur">{tr.durationText}</span>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {demo.artists.length > 0 && (
            <div className="onb-demo-artists" aria-hidden="true">
              {demo.artists.slice(0, 6).map((a) => (
                <div key={a.id} className="onb-demo-artist">
                  {a.thumbnailUrl ? <img src={a.thumbnailUrl} alt="" /> : null}
                  <span>{a.title}</span>
                </div>
              ))}
            </div>
          )}
          <p className="onb-finePrint">{t('onboarding.tour.sampleNote')}</p>
        </>
      ) : (
        <p className="onb-finePrint">{t('onboarding.tour.samplePending')}</p>
      )}
    </div>
  )
}
