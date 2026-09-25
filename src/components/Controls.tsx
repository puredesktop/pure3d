import { useRef, useState } from 'react'
import { ToolbarSelect } from '@purescience/platform-ui/components/common/containers/AppChrome'
import {
  SelectMenu,
  SelectMenuItem,
} from '@purescience/platform-ui/components/common/dropdown/SelectMenu'
import { ChevronDown } from 'lucide-react'
export { NumberField } from '@purescience/platform-ui/components/common/inputs/NumberField'
export { ColorField } from '@purescience/platform-ui/components/common/inputs/ColorField'
export { Slider } from '@purescience/platform-ui/components/common/inputs/Slider'

export function Choice({
  label,
  options,
  onChange,
  disabled = false,
}: {
  label: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  return (
    <>
      <ToolbarSelect
        ref={anchor}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {label}
        <ChevronDown size={12} />
      </ToolbarSelect>
      <SelectMenu
        open={open}
        anchorRef={anchor}
        onClose={() => setOpen(false)}
        minWidth={160}
      >
        {options.map(o => (
          <SelectMenuItem
            key={o.value}
            label={o.label}
            onSelect={() => {
              setOpen(false)
              onChange(o.value)
            }}
          />
        ))}
      </SelectMenu>
    </>
  )
}
