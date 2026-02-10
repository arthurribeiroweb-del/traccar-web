export default {
  MuiButtonBase: {
    defaultProps: {
      disableRipple: true,
      disableTouchRipple: true,
    },
  },
  MuiListItemButton: {
    defaultProps: {
      disableRipple: true,
      disableTouchRipple: true,
    },
  },
  MuiIconButton: {
    defaultProps: {
      disableRipple: true,
      disableTouchRipple: true,
    },
  },
  MuiBottomNavigationAction: {
    defaultProps: {
      disableRipple: true,
    },
  },
  MuiUseMediaQuery: {
    defaultProps: {
      noSsr: true,
    },
  },
  MuiOutlinedInput: {
    styleOverrides: {
      root: ({ theme }) => ({
        backgroundColor: theme.palette.background.default,
      }),
    },
  },
  MuiButton: {
    styleOverrides: {
      sizeMedium: {
        height: '40px',
      },
    },
  },
  MuiFormControl: {
    defaultProps: {
      size: 'small',
    },
  },
  MuiSnackbar: {
    defaultProps: {
      anchorOrigin: {
        vertical: 'bottom',
        horizontal: 'center',
      },
    },
  },
  MuiTooltip: {
    defaultProps: {
      enterDelay: 500,
      enterNextDelay: 500,
      disableTouchListener: true,
    },
  },
  MuiTableCell: {
    styleOverrides: {
      root: ({ theme }) => ({
        '@media print': {
          color: theme.palette.alwaysDark.main,
        },
      }),
    },
  },
};
