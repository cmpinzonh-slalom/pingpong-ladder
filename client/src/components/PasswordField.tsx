import { IconButton, InputAdornment, TextField, type TextFieldProps } from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { useState } from 'react';

/** Password input with a show/hide toggle. */
export default function PasswordField(props: Omit<TextFieldProps, 'type'>) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      {...props}
      type={visible ? 'text' : 'password'}
      slotProps={{
        ...props.slotProps,
        htmlInput: { autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false },
        input: {
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                aria-label={visible ? 'Hide password' : 'Show password'}
                onClick={() => setVisible((v) => !v)}
                onMouseDown={(e) => e.preventDefault()}
                edge="end"
              >
                {visible ? <VisibilityOff /> : <Visibility />}
              </IconButton>
            </InputAdornment>
          ),
        },
      }}
    />
  );
}
