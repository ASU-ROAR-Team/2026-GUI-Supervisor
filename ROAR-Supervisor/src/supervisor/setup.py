import os
from glob import glob
from setuptools import find_packages, setup

package_name = 'supervisor'

setup(
    name=package_name,
    version='0.0.0',
    packages=find_packages(exclude=['test']),
    data_files=[
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml', 'supervisor/config.yaml']),
        # This line registers your launch folder so ROS2 can find it
        (os.path.join('share', package_name, 'launch'), glob(os.path.join('launch', '*launch.[pxy][yma]*'))),
    ],
    install_requires=['setuptools', 'psutil', 'pyyaml'],
    zip_safe=True,
    maintainer='redknight',
    maintainer_email='redknight@todo.todo',
    description='TODO: Package description',
    license='TODO: License declaration',
    extras_require={
        'test': [
            'pytest',
        ],
    },
    entry_points={
    'console_scripts': [
        'supervisor = supervisor.supervisor:main',
        'my_first_node = supervisor.my_first_node:main',
        'my_second_node = supervisor.my_second_node:main',
        'my_third_node = supervisor.my_third_node:main',
    ],
},
)
