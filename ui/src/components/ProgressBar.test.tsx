import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { ProgressBar } from './ProgressBar'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('ProgressBar Component', () => {
  it('does not render when isBusy is false', () => {
    render(
      <ProgressBar
        isBusy={false}
        isRestoring={false}
        isPaused={false}
        progressPercent={0}
      />
    )
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('renders determinate progress bar when isBusy is true and progressPercent > 0', () => {
    render(
      <ProgressBar
        isBusy={true}
        isRestoring={true}
        isPaused={false}
        progressPercent={65}
      />
    )
    const progressBar = screen.getByRole('progressbar')
    expect(progressBar).toBeInTheDocument()
    expect(progressBar).toHaveAttribute('aria-valuenow', '65')
    expect(progressBar).toHaveAttribute('aria-valuetext', '65%')
  })

  it('renders indeterminate mode when progressPercent is 0', () => {
    render(
      <ProgressBar
        isBusy={true}
        isRestoring={false}
        isPaused={false}
        progressPercent={0}
        activeTask={{
          type: 'install_obs',
          labelKey: 'telemetry.task_install_obs',
          progressPercent: 0,
        }}
      />
    )
    const progressBar = screen.getByRole('progressbar')
    expect(progressBar).toBeInTheDocument()
    expect(progressBar).toHaveAttribute('aria-valuenow', '0')
  })

  it('supports paused state', () => {
    render(
      <ProgressBar
        isBusy={true}
        isRestoring={true}
        isPaused={true}
        progressPercent={50}
      />
    )
    const progressBar = screen.getByRole('progressbar')
    expect(progressBar).toBeInTheDocument()
    expect(progressBar).toHaveAttribute('aria-valuenow', '50')
  })
})
