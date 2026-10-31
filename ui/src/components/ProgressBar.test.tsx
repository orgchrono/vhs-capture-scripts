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
    const determinateFill = screen.getByTestId('progress-bar-determinate')
    expect(determinateFill).toHaveStyle({ width: '65%' })
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
    expect(screen.getByTestId('progress-bar-indeterminate')).toBeInTheDocument()
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

  it('clamps negative percentages to 0 and values exceeding 100 to 100', () => {
    const { rerender } = render(
      <ProgressBar
        isBusy={true}
        isRestoring={true}
        isPaused={false}
        progressPercent={-15}
      />
    )
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')

    rerender(
      <ProgressBar
        isBusy={true}
        isRestoring={true}
        isPaused={false}
        progressPercent={145}
      />
    )
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
    expect(screen.getByTestId('progress-bar-determinate')).toHaveStyle({ width: '100%' })
  })

  it('safely handles non-finite numbers and rounds fractional percentages', () => {
    const { rerender } = render(
      <ProgressBar
        isBusy={true}
        isRestoring={true}
        isPaused={false}
        progressPercent={Number.NaN}
      />
    )
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')

    rerender(
      <ProgressBar
        isBusy={true}
        isRestoring={true}
        isPaused={false}
        progressPercent={73.6}
      />
    )
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '74')
    expect(screen.getByTestId('progress-bar-determinate')).toHaveStyle({ width: '74%' })
  })
})
